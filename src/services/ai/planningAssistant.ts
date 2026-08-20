import { prisma } from "@/lib/db";
import { formatAgentName } from "@/lib/constants";
import { calculateShiftHours } from "@/lib/planning/hours";
import { buildAssignmentWriteData } from "@/lib/prisma/assignment-write";
import { revalidateAfterChange } from "@/services/rules/validate-assignment";
import { mapRuleResultsToReasons } from "@/services/rules/eligibility";
import { getPlanningData } from "@/services/planning/queries";
import {
  PlanningSession,
  applyBulkFillWithSession,
} from "@/services/ai/planning-session";
import {
  buildPlanningAssistantContext,
  type SlotContextInput,
} from "@/services/ai/context-builder";
import {
  getOpenAiClient,
  isOpenAiConfigured,
  OPENAI_PLANNING_MODEL,
} from "@/services/ai/openai-client";
import {
  aiSuggestionResponseSchema,
  type AiSuggestionItem,
  type AutoAssignResult,
  type MonthlyPlanningResult,
  type ValidatedAiSuggestion,
} from "@/services/ai/types";
import type { AgentSuggestion } from "@/types/planning";
import { blendEngineAndAiScore } from "@/services/planning/score-fit";

const SYSTEM_PROMPT = `You are a security staffing planning assistant for BLACK SHIELD SÉCURITÉ PRIVÉE (France).

Your job: rank the provided candidates for ONE vacation/shift slot.

The engineFitScore is a deterministic fit score (0-100). Treat it as the primary ranking.
You may adjust scores by at most 15 points to break close ties, using rankingSignals.

Priority order (highest first):
1. Fill constrained agents on their ONLY site + allowed days first (e.g. MBODJI — LE DOUZE lundi/mardi only).
2. ONLY-site agents without day limits, then PREFERRED-site agents.
3. Day-only or night-restricted specialists on matching shifts.
4. Polyvalent agents (siteRestrictionType ANY, no site rules) are LAST — backup/replacement only.
5. Never auto-pick an agent who fails hard rules; only validated (eligible) candidates.

Rules:
- Only rank candidates in the list. Use agentId values exactly as provided.
- Never suggest an agent with availability flags true (vacation, absence, medical, unavailable).
- Warnings must be honest (near hour limit, not preferred day, weekend load, tight rest).
- Score 0-100 (higher = better fit). Stay close to engineFitScore.
- Return ONLY valid JSON matching the schema.
- Reasoning: short French phrases the planner will see.`;

function formatAiExplanation(item: AiSuggestionItem, agentName: string): string {
  const lines = [`${agentName} sélectionné :`, ...item.reasoning.map((r) => `- ${r}`)];
  if (item.warnings.length > 0) {
    lines.push("Avertissements :", ...item.warnings.map((w) => `- ${w}`));
  }
  return lines.join("\n");
}

async function callOpenAiForSuggestions(
  context: Awaited<ReturnType<typeof buildPlanningAssistantContext>>
): Promise<AiSuggestionItem[]> {
  const openai = getOpenAiClient();

  const response = await openai.chat.completions.create({
    model: OPENAI_PLANNING_MODEL,
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "planning_suggestions",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  agentId: { type: "string" },
                  score: { type: "number" },
                  reasoning: { type: "array", items: { type: "string" } },
                  warnings: { type: "array", items: { type: "string" } },
                },
                required: ["agentId", "score", "reasoning", "warnings"],
              },
            },
          },
          required: ["suggestions"],
        },
      },
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify(
          {
            task: "Rank agents for this vacation requirement. Stay close to engineFitScore; use rankingSignals for tie-breaks.",
            rankingPolicy: {
              primary: "engineFitScore",
              maxAdjustment: 15,
              preferDedicatedOverPolyvalent: true,
              preferPreferredDays: true,
              preferUnderusedAgents: true,
              avoidTightRest: true,
            },
            requirement: context.requirement,
            candidates: context.candidates,
            activeBusinessRules: context.activeRules,
          },
          null,
          2
        ),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("Réponse OpenAI vide");

  const parsed = aiSuggestionResponseSchema.parse(JSON.parse(raw));
  return parsed.suggestions.sort((a, b) => b.score - a.score);
}

export async function validateAiSuggestion(
  input: SlotContextInput,
  item: AiSuggestionItem,
  agentName: string,
  session: PlanningSession,
  engineScore?: number
): Promise<ValidatedAiSuggestion> {
  const agent = session.agentsById.get(item.agentId);

  if (!agent) {
    return {
      agentId: item.agentId,
      agentName,
      score: item.score,
      accepted: false,
      reasoning: item.reasoning,
      warnings: item.warnings,
      aiExplanation: formatAiExplanation(item, agentName),
      ruleFailures: ["Agent introuvable"],
    };
  }

  const slot = session.toVacationSlot(input);
  const { eligible, results } = await session.evaluateAgent(item.agentId, slot);
  const blendedScore = blendEngineAndAiScore(engineScore ?? item.score, item.score);

  const mapped = mapRuleResultsToReasons(results);
  const ruleFailures = mapped.reasonDetails
    .filter((r) => r.type === "error")
    .map((r) => r.text);

  const name = formatAgentName(agent.firstName, agent.lastName);

  return {
    agentId: item.agentId,
    agentName: name,
    score: blendedScore,
    accepted: eligible,
    reasoning: item.reasoning,
    warnings: [
      ...item.warnings,
      ...mapped.reasonDetails.filter((r) => r.type === "warn").map((r) => r.text),
    ],
    aiExplanation: formatAiExplanation(item, name),
    ruleFailures,
  };
}

function toAgentSuggestion(
  validated: ValidatedAiSuggestion,
  engine?: AgentSuggestion
): AgentSuggestion {
  const reasonDetails = [
    ...validated.reasoning.map((text) => ({ text: `✓ ${text}`, type: "ok" as const })),
    ...validated.warnings.map((text) => ({ text: `⚠ ${text}`, type: "warn" as const })),
    ...validated.ruleFailures.map((text) => ({ text, type: "error" as const })),
  ];

  return {
    agentId: validated.agentId,
    agentName: validated.agentName,
    score: validated.score,
    accepted: validated.accepted,
    reasons: reasonDetails.map((r) => r.text),
    reasonDetails,
    contractHours: engine?.contractHours,
    workedHours: engine?.workedHours,
    remainingHours: engine?.remainingHours,
    shiftHours: engine?.shiftHours,
    aiGenerated: true,
    aiExplanation: validated.aiExplanation,
    aiConfidence: validated.score,
  };
}

async function rulesEngineFallback(
  input: SlotContextInput,
  session?: PlanningSession
): Promise<AgentSuggestion[]> {
  const s = session ?? (await PlanningSession.open(input.planningMonthId));
  return s.getSuggestions(input);
}

/** Ask OpenAI for ranked candidates, then validate each through the Rules Engine. */
export async function getAiPlanningSuggestions(
  input: SlotContextInput
): Promise<AgentSuggestion[]> {
  const session = await PlanningSession.open(input.planningMonthId);

  if (!isOpenAiConfigured()) {
    return rulesEngineFallback(input, session);
  }

  try {
    const engineSuggestions = await session.getSuggestions(input);
    const engineById = new Map(engineSuggestions.map((s) => [s.agentId, s]));
    const context = await buildPlanningAssistantContext(input, session);
    const candidateNames = new Map(context.candidates.map((c) => [c.agentId, c.name]));

    const aiItems = await callOpenAiForSuggestions(context);
    const validated = await Promise.all(
      aiItems.map((item) => {
        const name = candidateNames.get(item.agentId) ?? item.agentId;
        return validateAiSuggestion(
          input,
          item,
          name,
          session,
          engineById.get(item.agentId)?.score
        );
      })
    );

    const accepted = validated
      .filter((v) => v.accepted)
      .sort((a, b) => b.score - a.score);
    const rejected = validated.filter((v) => !v.accepted);
    const aiMapped = [...accepted, ...rejected].map((v) =>
      toAgentSuggestion(v, engineById.get(v.agentId))
    );
    const seen = new Set(aiMapped.map((s) => s.agentId));
    const rest = engineSuggestions.filter((s) => !seen.has(s.agentId));

    return [...aiMapped, ...rest];
  } catch {
    return rulesEngineFallback(input, session);
  }
}

export type AutoAssignInput = SlotContextInput & {
  requirementId?: string;
};

/** Try AI-ranked candidates; Rules Engine must approve before DB write. */
export async function autoAssignVacation(input: AutoAssignInput): Promise<AutoAssignResult> {
  const suggestions = await getAiPlanningSuggestions(input);
  const candidates = suggestions.filter((s) => s.accepted);

  if (candidates.length === 0) {
    return {
      success: false,
      error: "Aucun candidat validé par le moteur de règles",
    };
  }

  for (const candidate of candidates) {
    const result = await persistValidatedAssignment(input, candidate);
    if (result.success) return result;
  }

  return { success: false, error: "Impossible de créer l'affectation" };
}

async function persistValidatedAssignment(
  input: AutoAssignInput,
  candidate: AgentSuggestion
): Promise<AutoAssignResult> {
  const hours = calculateShiftHours(input.startTime, input.endTime);

  const assignment = await prisma.assignment.create({
    data: {
      ...buildAssignmentWriteData({
        planningMonthId: input.planningMonthId,
        agentId: candidate.agentId,
        siteId: input.siteId,
        requirementId: input.requirementId,
        date: input.date,
        shiftType: input.shiftType,
        role: input.role ?? "AGENT",
        startTime: input.startTime,
        endTime: input.endTime,
        hours,
      }),
      aiGenerated: true,
      aiConfidence: candidate.aiConfidence ?? candidate.score,
      aiExplanation: candidate.aiExplanation ?? candidate.reasons.join("\n"),
    },
  });

  const validation = await revalidateAfterChange(assignment.id);

  if (validation.status === "error") {
    await prisma.assignment.delete({ where: { id: assignment.id } });
    return {
      success: false,
      error:
        validation.results
          .filter((r) => !r.valid && r.severity === "ERROR")
          .map((r) => r.message)
          .join(" · ") || "Rejeté par le moteur de règles",
    };
  }

  return {
    success: true,
    assignmentId: assignment.id,
    agentName: candidate.agentName,
    aiExplanation: candidate.aiExplanation,
    aiConfidence: candidate.aiConfidence ?? candidate.score,
  };
}

export type GenerateMonthlyPlanningInput = {
  year: number;
  month: number;
  siteIds?: string[];
  limit?: number;
};

/** Fill empty vacations site-by-site using rules engine (fast bulk path). */
export async function generateMonthlyPlanning(
  input: GenerateMonthlyPlanningInput
): Promise<MonthlyPlanningResult> {
  const data = await getPlanningData(input.year, input.month);
  let slots = data.unfilledSlots;

  if (input.siteIds?.length) {
    const siteSet = new Set(input.siteIds);
    slots = slots.filter((s) => siteSet.has(s.siteId));
  }

  const batch = slots.slice(0, input.limit ?? 60);
  const fill = await applyBulkFillWithSession(data.planningMonth.id, batch, {
    limit: batch.length,
    aiGenerated: true,
  });

  return {
    applied: fill.applied,
    skipped: fill.skipped,
    errors: fill.errors,
    assignments: batch.map((slot) => ({
      slotId: slot.slotId,
      siteName: slot.siteName,
      date: slot.date,
      success: fill.applied > 0,
    })),
  };
}
