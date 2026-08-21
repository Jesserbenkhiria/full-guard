import type { Agent, AgentSiteRule, Assignment, PositionRole, ShiftType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatAgentName } from "@/lib/constants";
import { calculateShiftHours, getRemainingContractHours, sumAssignmentHours } from "@/lib/planning/hours";
import { parseDateKey, toDateKey } from "@/lib/planning/dates";
import { assignmentsMatchSlot } from "@/lib/planning/shift-templates";
import { buildAssignmentWriteData } from "@/lib/prisma/assignment-write";
import { createConfiguredEngine } from "@/services/rules/load-engine";
import type { RulesEngine } from "@/services/rules/engine";
import {
  evaluateAgentForSlot,
  loadAgentsAvailabilityForDate,
  mapRuleResultsToReasons,
  type AgentAvailability,
  type VacationSlot,
} from "@/services/rules/eligibility";
import {
  buildDedicatedSiteIds,
  compareAgentsForSlot,
  compareSequentialSlotOrder,
  filterDedicatedSiteCandidates,
  getAgentSlotDedication,
  isAgentAllowedOnDedicatedSite,
  type SlotPickContext,
} from "@/services/planning/constraint-priority";
import { isOpenAiConfigured } from "@/services/ai/openai-client";
import { revalidateAfterChange, hasHardWriteConflict } from "@/services/rules/validate-assignment";
import {
  clampScore,
  scoreAssignmentFit,
  teamAverageHours,
} from "@/services/planning/score-fit";
import {
  loadReferenceStatsFromDb,
  type ReferenceStatsBundle,
} from "@/services/planning/reference-stats";
import type { AgentSuggestion, SuggestionReasonDetail, UnfilledSlotPreview } from "@/types/planning";
import type { RuleResult } from "@/types";
import { fr } from "@/lib/i18n/fr";

export type AgentWithRules = Agent & { siteRules: AgentSiteRule[] };

export type SessionSlotInput = {
  siteId: string;
  date: Date | string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  role?: PositionRole;
  requirementId?: string;
  excludeAssignmentId?: string;
};

export type PickedAgent = {
  agentId: string;
  agentName: string;
  score: number;
  results: RuleResult[];
};

export type BulkFillResult = {
  applied: number;
  skipped: number;
  errors: string[];
};

function addReason(
  reasons: string[],
  reasonDetails: SuggestionReasonDetail[],
  text: string,
  type: SuggestionReasonDetail["type"]
) {
  if (!reasons.includes(text)) {
    reasons.push(text);
    reasonDetails.push({ text, type });
  }
}

/** In-memory cache for one planning month — avoids N+1 queries during bulk/AI flows. */
export class PlanningSession {
  readonly planningMonthId: string;
  readonly agents: AgentWithRules[];
  readonly agentsById: Map<string, AgentWithRules>;
  readonly sitesById: Map<string, { id: string; name: string }>;
  readonly activeRules: { code: string; name: string; description: string | null }[];
  readonly engine: RulesEngine;
  monthAssignments: Assignment[];
  readonly requirementPriorityById: Map<string, number>;
  readonly referenceStats: ReferenceStatsBundle | null;
  private availabilityCache = new Map<string, Map<string, AgentAvailability>>();
  private siteHistoryCounts = new Map<string, number>();

  private constructor(
    planningMonthId: string,
    agents: AgentWithRules[],
    sites: { id: string; name: string }[],
    monthAssignments: Assignment[],
    engine: RulesEngine,
    activeRules: { code: string; name: string; description: string | null }[],
    requirementPriorityById: Map<string, number>,
    referenceStats: ReferenceStatsBundle | null
  ) {
    this.planningMonthId = planningMonthId;
    this.agents = agents;
    this.agentsById = new Map(agents.map((a) => [a.id, a]));
    this.sitesById = new Map(sites.map((s) => [s.id, s]));
    this.monthAssignments = monthAssignments;
    this.engine = engine;
    this.activeRules = activeRules;
    this.requirementPriorityById = requirementPriorityById;
    this.referenceStats = referenceStats;

    for (const a of monthAssignments) {
      const key = `${a.agentId}:${a.siteId}`;
      this.siteHistoryCounts.set(key, (this.siteHistoryCounts.get(key) ?? 0) + 1);
    }
  }

  static async open(planningMonthId: string): Promise<PlanningSession> {
    const [agents, sites, monthAssignments, engine, activeRules, requirements, referenceStats] =
      await Promise.all([
      prisma.agent.findMany({
        where: { active: true },
        include: { siteRules: { where: { active: true } } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      prisma.site.findMany({ select: { id: true, name: true } }),
      prisma.assignment.findMany({ where: { planningMonthId } }),
      createConfiguredEngine(),
      prisma.rule.findMany({
        where: { enabled: true },
        select: { code: true, name: true, description: true },
        orderBy: { code: "asc" },
      }),
      prisma.siteRequirement.findMany({
        where: { active: true },
        select: { id: true, priority: true },
      }),
      loadReferenceStatsFromDb(prisma),
    ]);

    const requirementPriorityById = new Map(requirements.map((r) => [r.id, r.priority]));

    return new PlanningSession(
      planningMonthId,
      agents,
      sites,
      monthAssignments,
      engine,
      activeRules,
      requirementPriorityById,
      referenceStats
    );
  }

  siteName(siteId: string): string {
    return this.sitesById.get(siteId)?.name ?? "";
  }

  private normalizeDate(date: Date | string): Date {
    return typeof date === "string" ? parseDateKey(date) : date;
  }

  async availabilityFor(date: Date | string): Promise<Map<string, AgentAvailability>> {
    const d = this.normalizeDate(date);
    const key = toDateKey(d);
    let cached = this.availabilityCache.get(key);
    if (!cached) {
      cached = await loadAgentsAvailabilityForDate(
        this.agents.map((a) => a.id),
        d
      );
      this.availabilityCache.set(key, cached);
    }
    return cached;
  }

  toVacationSlot(input: SessionSlotInput): VacationSlot {
    return {
      planningMonthId: this.planningMonthId,
      siteId: input.siteId,
      date: this.normalizeDate(input.date),
      shiftType: input.shiftType,
      startTime: input.startTime,
      endTime: input.endTime,
      role: input.role,
      excludeAssignmentId: input.excludeAssignmentId,
    };
  }

  async evaluateAgent(
    agentId: string,
    slot: VacationSlot
  ): Promise<{ eligible: boolean; results: RuleResult[] }> {
    const agent = this.agentsById.get(agentId);
    if (!agent) {
      return { eligible: false, results: [] };
    }

    const availability = await this.availabilityFor(slot.date);
    return evaluateAgentForSlot(
      agent,
      slot,
      this.siteName(slot.siteId),
      this.monthAssignments,
      availability.get(agentId)!,
      this.engine
    );
  }

  /** Full ranked list — rules engine only, uses in-memory state (no extra DB round-trips). */
  async getSuggestions(input: SessionSlotInput): Promise<AgentSuggestion[]> {
    const slot = this.toVacationSlot(input);
    const shiftHours = calculateShiftHours(slot.startTime, slot.endTime);
    const availability = await this.availabilityFor(slot.date);
    const siteName = this.siteName(slot.siteId);
    const avgHours = teamAverageHours(this.monthAssignments, this.agents.length);
    const suggestions: AgentSuggestion[] = [];
    const pickCtx: SlotPickContext = {
      siteId: slot.siteId,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      shiftType: slot.shiftType,
      role: input.role,
    };
    const dedicatedSiteIds = buildDedicatedSiteIds(this.agents);

    for (const agent of this.agents) {
      const agentName = formatAgentName(agent.firstName, agent.lastName);
      const { eligible, results } = await evaluateAgentForSlot(
        agent,
        slot,
        siteName,
        this.monthAssignments,
        availability.get(agent.id)!,
        this.engine
      );

      const mapped = mapRuleResultsToReasons(results);
      let score = eligible ? 55 : 0;
      let accepted = eligible;

      if (
        accepted &&
        !isAgentAllowedOnDedicatedSite(agent, slot.siteId, dedicatedSiteIds, slot.date)
      ) {
        accepted = false;
        score = 0;
        addReason(
          mapped.reasons,
          mapped.reasonDetails,
          fr.planning.sitePoolRequired,
          "error"
        );
      }

      if (accepted) {
        const warningCount = mapped.reasonDetails.filter((r) => r.type === "warn").length;
        const fit = scoreAssignmentFit({
          agent,
          siteId: slot.siteId,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          shiftHours,
          shiftType: slot.shiftType,
          monthAssignments: this.monthAssignments,
          siteHistoryCount: this.siteHistoryCounts.get(`${agent.id}:${slot.siteId}`) ?? 0,
          teamAvgHours: avgHours,
          warningCount,
          referenceStats: this.referenceStats,
        });
        score += fit.delta;
        for (const reason of fit.reasons) {
          addReason(mapped.reasons, mapped.reasonDetails, reason.text, reason.type);
        }
        if (getAgentSlotDedication(agent, pickCtx) >= 100) {
          addReason(mapped.reasons, mapped.reasonDetails, fr.planning.dedicatedAgent, "ok");
        }
      }

      if (!accepted && mapped.reasons.length === 0) {
        addReason(mapped.reasons, mapped.reasonDetails, "Non éligible", "error");
      }

      const agentMonthAssignments = this.monthAssignments.filter(
        (a) => a.agentId === agent.id && a.id !== slot.excludeAssignmentId
      );
      const workedHours = sumAssignmentHours(agentMonthAssignments);
      const remainingHours = getRemainingContractHours(agent.contractHours, workedHours);

      suggestions.push({
        agentId: agent.id,
        agentName,
        score: clampScore(score),
        accepted,
        reasons: mapped.reasons,
        reasonDetails: mapped.reasonDetails,
        contractHours: agent.contractHours,
        workedHours,
        remainingHours,
        shiftHours,
      });
    }

    return suggestions.sort((a, b) =>
      compareAgentsForSlot(a, b, this.agentsById, pickCtx)
    );
  }

  /** Rules-engine pick — dedicated site tiers (LE DOUZE: Kaid/Mbodji/Djonka then Evina/Djedia). */
  async pickBestAgent(input: SessionSlotInput): Promise<PickedAgent | null> {
    const suggestions = await this.getSuggestions(input);
    const dedicatedSiteIds = buildDedicatedSiteIds(this.agents);
    const isDedicatedSite = dedicatedSiteIds.has(input.siteId);
    const pickCtx: SlotPickContext = {
      siteId: input.siteId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      shiftType: input.shiftType,
      role: input.role,
    };

    let candidates = suggestions.filter((s) => s.accepted);

    if (isDedicatedSite) {
      candidates = filterDedicatedSiteCandidates(candidates, this.agentsById, pickCtx);
    }

    candidates.sort((a, b) =>
      compareAgentsForSlot(a, b, this.agentsById, pickCtx)
    );

    const top = candidates[0];
    if (!top) return null;

    const slot = this.toVacationSlot(input);
    const { eligible, results } = await this.evaluateAgent(top.agentId, slot);
    if (!eligible) return null;

    return {
      agentId: top.agentId,
      agentName: top.agentName,
      score: top.score,
      results,
    };
  }

  trackAssignment(assignment: Assignment) {
    this.monthAssignments.push(assignment);
    this.availabilityCache.delete(toDateKey(assignment.date));
    const key = `${assignment.agentId}:${assignment.siteId}`;
    this.siteHistoryCounts.set(key, (this.siteHistoryCounts.get(key) ?? 0) + 1);
  }

  untrackAssignment(assignmentId: string) {
    const index = this.monthAssignments.findIndex((a) => a.id === assignmentId);
    if (index < 0) return;

    const removed = this.monthAssignments.splice(index, 1)[0];
    this.availabilityCache.delete(toDateKey(removed.date));
    const key = `${removed.agentId}:${removed.siteId}`;
    const count = this.siteHistoryCounts.get(key) ?? 0;
    if (count <= 1) this.siteHistoryCounts.delete(key);
    else this.siteHistoryCounts.set(key, count - 1);
  }

  /** Simulate an assignment in-memory (preview) without persisting. */
  trackHypotheticalAssignment(slot: UnfilledSlotPreview, agentId: string) {
    this.trackAssignment({
      id: `preview-${slot.slotId}`,
      planningMonthId: this.planningMonthId,
      agentId,
      siteId: slot.siteId,
      requirementId: slot.requirementId,
      date: parseDateKey(slot.date),
      shiftType: slot.shiftType,
      role: slot.role,
      startTime: slot.startTime,
      endTime: slot.endTime,
      hours: calculateShiftHours(slot.startTime, slot.endTime),
      notes: null,
      aiGenerated: false,
      aiConfidence: null,
      aiExplanation: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async getRankedCandidates(
    input: SessionSlotInput,
    useAi: boolean
  ): Promise<AgentSuggestion[]> {
    const rulesCandidates = async () =>
      this.filterDedicatedCandidates(
        input,
        (await this.getSuggestions(input)).filter((s) => s.accepted)
      );

    if (useAi && isOpenAiConfigured()) {
      const { getAiPlanningSuggestions } = await import("@/services/ai/planningAssistant");
      const suggestions = await getAiPlanningSuggestions(
        {
          planningMonthId: this.planningMonthId,
          siteId: input.siteId,
          date: this.normalizeDate(input.date),
          shiftType: input.shiftType,
          startTime: input.startTime,
          endTime: input.endTime,
          role: input.role,
        },
        this
      );
      const filtered = this.filterDedicatedCandidates(
        input,
        suggestions.filter((s) => s.accepted)
      );
      if (filtered.length > 0) return filtered;
    }

    return rulesCandidates();
  }

  private filterDedicatedCandidates(
    input: SessionSlotInput,
    candidates: AgentSuggestion[]
  ): AgentSuggestion[] {
    const dedicatedSiteIds = buildDedicatedSiteIds(this.agents);
    if (!dedicatedSiteIds.has(input.siteId)) return candidates;

    const pickCtx: SlotPickContext = {
      siteId: input.siteId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      shiftType: input.shiftType,
      role: input.role,
    };

    return filterDedicatedSiteCandidates(candidates, this.agentsById, pickCtx);
  }

  isSlotFilled(slot: UnfilledSlotPreview): boolean {
    const matching = this.monthAssignments.filter((a) =>
      assignmentsMatchSlot(
        { ...a, date: toDateKey(a.date) },
        {
          siteId: slot.siteId,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          requirementId: slot.requirementId,
          role: slot.role,
        }
      )
    );
    return matching.length > slot.slotIndex;
  }
}

function orderSlotsSequentially(slots: UnfilledSlotPreview[]): UnfilledSlotPreview[] {
  return [...slots].sort(compareSequentialSlotOrder);
}

function slotToSessionInput(slot: UnfilledSlotPreview): SessionSlotInput {
  return {
    siteId: slot.siteId,
    date: slot.date,
    shiftType: slot.shiftType,
    startTime: slot.startTime,
    endTime: slot.endTime,
    role: slot.role,
  };
}

async function tryPersistAssignment(
  session: PlanningSession,
  slot: UnfilledSlotPreview,
  candidate: AgentSuggestion,
  options: { aiGenerated?: boolean }
): Promise<{ ok: true; assignmentId: string } | { ok: false; error: string }> {
  const hours = calculateShiftHours(slot.startTime, slot.endTime);
  const aiExplanation = options.aiGenerated
    ? candidate.aiExplanation ??
      `${candidate.agentName} — ${candidate.reasons.slice(0, 3).join(" · ")}`
    : undefined;

  const assignment = await prisma.assignment.create({
    data: {
      ...buildAssignmentWriteData({
        planningMonthId: session.planningMonthId,
        agentId: candidate.agentId,
        siteId: slot.siteId,
        requirementId: slot.requirementId,
        date: parseDateKey(slot.date),
        shiftType: slot.shiftType,
        role: slot.role,
        startTime: slot.startTime,
        endTime: slot.endTime,
        hours,
      }),
      aiGenerated: options.aiGenerated ?? false,
      aiConfidence: options.aiGenerated ? (candidate.aiConfidence ?? candidate.score) : null,
      aiExplanation: aiExplanation ?? null,
    },
  });

  const validation = await revalidateAfterChange(assignment.id);

  if (hasHardWriteConflict(validation.results)) {
    await prisma.assignment.delete({ where: { id: assignment.id } });
    const message =
      validation.results
        .filter((r) => !r.valid && r.severity === "ERROR")
        .map((r) => r.message)
        .filter(Boolean)
        .join(" · ") || "Rejeté par le moteur de règles";
    return { ok: false, error: message };
  }

  session.trackAssignment(assignment);
  return { ok: true, assignmentId: assignment.id };
}

export async function fetchBulkSlotSuggestions(
  planningMonthId: string,
  slots: UnfilledSlotPreview[],
  options?: { useAi?: boolean; simulateSequential?: boolean }
): Promise<(UnfilledSlotPreview & { suggestions: AgentSuggestion[] })[]> {
  const session = await PlanningSession.open(planningMonthId);
  const ordered = orderSlotsSequentially(slots);
  const results: (UnfilledSlotPreview & { suggestions: AgentSuggestion[] })[] = [];

  for (const slot of ordered) {
    if (session.isSlotFilled(slot)) {
      results.push({ ...slot, suggestions: [] });
      continue;
    }

    const suggestions = await session.getRankedCandidates(slotToSessionInput(slot), options?.useAi ?? false);
    results.push({ ...slot, suggestions });

    if (options?.simulateSequential && suggestions[0]) {
      session.trackHypotheticalAssignment(slot, suggestions[0].agentId);
    }
  }

  return results;
}

export type FillStepResult = {
  status: "applied" | "skipped" | "already_filled" | "no_candidate" | "failed";
  agentName?: string;
  assignmentId?: string;
  error?: string;
};

export async function applySingleSlotFill(
  planningMonthId: string,
  slot: UnfilledSlotPreview,
  options?: { useAi?: boolean }
): Promise<FillStepResult> {
  const session = await PlanningSession.open(planningMonthId);
  const useAi = options?.useAi ?? false;

  if (session.isSlotFilled(slot)) {
    return { status: "already_filled" };
  }

  const candidates = await session.getRankedCandidates(slotToSessionInput(slot), useAi);
  if (candidates.length === 0) {
    return { status: "no_candidate" };
  }

  let lastError = "Aucun candidat validé";
  for (const candidate of candidates) {
    const persisted = await tryPersistAssignment(session, slot, candidate, {
      aiGenerated: useAi,
    });
    if (persisted.ok) {
      return {
        status: "applied",
        agentName: candidate.agentName,
        assignmentId: persisted.assignmentId,
      };
    }
    lastError = persisted.error;
  }

  return { status: "failed", error: lastError };
}

export function orderSlotsForFill(slots: UnfilledSlotPreview[]): UnfilledSlotPreview[] {
  return orderSlotsSequentially(slots);
}

export async function applyBulkFillWithSession(
  planningMonthId: string,
  slots: UnfilledSlotPreview[],
  options?: { limit?: number; useAi?: boolean; aiGenerated?: boolean }
): Promise<BulkFillResult> {
  const limit = options?.limit ?? slots.length;
  const useAi = options?.useAi ?? options?.aiGenerated ?? false;
  const result: BulkFillResult = { applied: 0, skipped: 0, errors: [] };

  const session = await PlanningSession.open(planningMonthId);
  const batch = orderSlotsSequentially(slots.slice(0, limit));

  for (const slot of batch) {
    try {
      if (session.isSlotFilled(slot)) {
        result.skipped++;
        continue;
      }

      const candidates = await session.getRankedCandidates(slotToSessionInput(slot), useAi);
      if (candidates.length === 0) {
        result.skipped++;
        continue;
      }

      let assigned = false;
      for (const candidate of candidates) {
        const persisted = await tryPersistAssignment(session, slot, candidate, {
          aiGenerated: useAi,
        });

        if (persisted.ok) {
          result.applied++;
          assigned = true;
          break;
        }

        result.errors.push(
          `${slot.siteName} ${slot.date} (${candidate.agentName}): ${persisted.error}`
        );
      }

      if (!assigned) {
        result.skipped++;
      }
    } catch (err) {
      result.errors.push(
        `${slot.siteName} ${slot.date}: ${err instanceof Error ? err.message : "Erreur"}`
      );
      result.skipped++;
    }
  }

  return result;
}

export async function validateAssignmentIds(assignmentIds: string[]): Promise<{
  errorCount: number;
  validCount: number;
}> {
  if (assignmentIds.length === 0) return { errorCount: 0, validCount: 0 };

  const { validateAssignment, syncAgentContractHoursAlert } = await import(
    "@/services/rules/validate-assignment"
  );

  const outcomes = await Promise.all(assignmentIds.map((id) => validateAssignment(id)));

  let errorCount = 0;
  let validCount = 0;
  const seenAgents = new Set<string>();
  let planningMonthId: string | undefined;

  for (const outcome of outcomes) {
    if (outcome.status === "error") errorCount++;
    else validCount++;

    const row = await prisma.assignment.findUnique({
      where: { id: outcome.assignmentId },
      select: { agentId: true, planningMonthId: true },
    });
    if (row) {
      seenAgents.add(row.agentId);
      planningMonthId = row.planningMonthId;
    }
  }

  if (planningMonthId) {
    await Promise.all(
      [...seenAgents].map((agentId) => syncAgentContractHoursAlert(agentId, planningMonthId!))
    );
  }

  return { errorCount, validCount };
}

export async function rollbackAssignments(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
}
