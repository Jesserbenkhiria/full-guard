import type { Agent, AgentSiteRule, Assignment, PositionRole, ShiftType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatAgentName, POSITION_ROLE_LABELS, resolveIsTeamLeader } from "@/lib/constants";
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
  agentBelongsToSitePool,
  buildDedicatedSiteIds,
  compareAgentsForSlot,
  compareSlotFillOrder,
  getAgentSlotDedication,
  isAgentAllowedOnDedicatedSite,
  isPolyvalentAgent,
  scoreSlotConstraintPriority,
  type SlotPickContext,
} from "@/services/planning/constraint-priority";
import {
  clampScore,
  scoreAssignmentFit,
  teamAverageHours,
} from "@/services/planning/score-fit";
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
  private availabilityCache = new Map<string, Map<string, AgentAvailability>>();
  private siteHistoryCounts = new Map<string, number>();

  private constructor(
    planningMonthId: string,
    agents: AgentWithRules[],
    sites: { id: string; name: string }[],
    monthAssignments: Assignment[],
    engine: RulesEngine,
    activeRules: { code: string; name: string; description: string | null }[],
    requirementPriorityById: Map<string, number>
  ) {
    this.planningMonthId = planningMonthId;
    this.agents = agents;
    this.agentsById = new Map(agents.map((a) => [a.id, a]));
    this.sitesById = new Map(sites.map((s) => [s.id, s]));
    this.monthAssignments = monthAssignments;
    this.engine = engine;
    this.activeRules = activeRules;
    this.requirementPriorityById = requirementPriorityById;

    for (const a of monthAssignments) {
      const key = `${a.agentId}:${a.siteId}`;
      this.siteHistoryCounts.set(key, (this.siteHistoryCounts.get(key) ?? 0) + 1);
    }
  }

  static async open(planningMonthId: string): Promise<PlanningSession> {
    const [agents, sites, monthAssignments, engine, activeRules, requirements] = await Promise.all([
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
    ]);

    const requirementPriorityById = new Map(requirements.map((r) => [r.id, r.priority]));

    return new PlanningSession(
      planningMonthId,
      agents,
      sites,
      monthAssignments,
      engine,
      activeRules,
      requirementPriorityById
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

      if (input.role === "TEAM_LEADER") {
        if (!resolveIsTeamLeader(agent)) {
          accepted = false;
          score = 0;
          addReason(
            mapped.reasons,
            mapped.reasonDetails,
            `Poste ${POSITION_ROLE_LABELS.TEAM_LEADER} requis`,
            "error"
          );
        }
      }

      if (
        accepted &&
        !isAgentAllowedOnDedicatedSite(agent, slot.siteId, dedicatedSiteIds)
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
          monthAssignments: this.monthAssignments,
          siteHistoryCount: this.siteHistoryCounts.get(`${agent.id}:${slot.siteId}`) ?? 0,
          teamAvgHours: avgHours,
          warningCount,
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

  /** Rules-engine pick — pool agents first on dedicated sites, polyvalent last. */
  async pickBestAgent(input: SessionSlotInput): Promise<PickedAgent | null> {
    const suggestions = await this.getSuggestions(input);
    const dedicatedSiteIds = buildDedicatedSiteIds(this.agents);
    const isDedicatedSite = dedicatedSiteIds.has(input.siteId);

    let candidates = suggestions.filter((s) => s.accepted);
    if (isDedicatedSite) {
      const poolAgents = candidates.filter((s) =>
        agentBelongsToSitePool(this.agentsById.get(s.agentId)!, input.siteId)
      );
      if (poolAgents.length > 0) {
        candidates = poolAgents;
      } else {
        candidates = candidates.filter((s) =>
          isPolyvalentAgent(this.agentsById.get(s.agentId)!)
        );
      }
    }

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

  isSlotFilled(slot: UnfilledSlotPreview): boolean {
    return this.monthAssignments.some((a) =>
      assignmentsMatchSlot(
        { ...a, date: toDateKey(a.date) },
        slot
      )
    );
  }
}

export async function fetchBulkSlotSuggestions(
  planningMonthId: string,
  slots: UnfilledSlotPreview[]
): Promise<(UnfilledSlotPreview & { suggestions: AgentSuggestion[] })[]> {
  const session = await PlanningSession.open(planningMonthId);

  const results: (UnfilledSlotPreview & { suggestions: AgentSuggestion[] })[] = [];
  for (const slot of slots) {
    const suggestions = await session.getSuggestions({
      siteId: slot.siteId,
      date: slot.date,
      shiftType: slot.shiftType,
      startTime: slot.startTime,
      endTime: slot.endTime,
      role: slot.role,
    });
    results.push({ ...slot, suggestions });
  }

  results.sort((a, b) => {
    const aAccepted = a.suggestions.filter((s) => s.accepted);
    const bAccepted = b.suggestions.filter((s) => s.accepted);
    const aIds = new Set(aAccepted.map((s) => s.agentId));
    const bIds = new Set(bAccepted.map((s) => s.agentId));
    const aCtx: SlotPickContext = {
      siteId: a.siteId,
      date: a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      shiftType: a.shiftType,
      role: a.role,
    };
    const bCtx: SlotPickContext = {
      siteId: b.siteId,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      shiftType: b.shiftType,
      role: b.role,
    };
    const aConstraint = scoreSlotConstraintPriority(session.agents, aIds, aCtx);
    const bConstraint = scoreSlotConstraintPriority(session.agents, bIds, bCtx);

    return compareSlotFillOrder(
      {
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        shiftType: a.shiftType,
        role: a.role,
        requirementPriority: session.requirementPriorityById.get(a.requirementId) ?? 0,
        eligibleCount: aAccepted.length,
        ...aConstraint,
      },
      {
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        shiftType: b.shiftType,
        role: b.role,
        requirementPriority: session.requirementPriorityById.get(b.requirementId) ?? 0,
        eligibleCount: bAccepted.length,
        ...bConstraint,
      }
    );
  });

  return results.map((row) => ({
    ...row,
    suggestions: row.suggestions.filter((s) => s.accepted),
  }));
}

async function orderSlotsForFill(
  session: PlanningSession,
  slots: UnfilledSlotPreview[]
): Promise<UnfilledSlotPreview[]> {
  const scored = await Promise.all(
    slots.map(async (slot) => {
      const suggestions = await session.getSuggestions({
        siteId: slot.siteId,
        date: slot.date,
        shiftType: slot.shiftType,
        startTime: slot.startTime,
        endTime: slot.endTime,
        role: slot.role,
      });
      const accepted = suggestions.filter((s) => s.accepted);
      const acceptedIds = new Set(accepted.map((s) => s.agentId));
      const pickCtx: SlotPickContext = {
        siteId: slot.siteId,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        shiftType: slot.shiftType,
        role: slot.role,
      };
      const constraint = scoreSlotConstraintPriority(session.agents, acceptedIds, pickCtx);

      return {
        slot,
        eligibleCount: accepted.length,
        requirementPriority: session.requirementPriorityById.get(slot.requirementId) ?? 0,
        ...constraint,
      };
    })
  );

  scored.sort((a, b) =>
    compareSlotFillOrder({
      date: a.slot.date,
      startTime: a.slot.startTime,
      endTime: a.slot.endTime,
      shiftType: a.slot.shiftType,
      role: a.slot.role,
      requirementPriority: a.requirementPriority,
      eligibleCount: a.eligibleCount,
      dedicatedEligibleCount: a.dedicatedEligibleCount,
      topDedication: a.topDedication,
      slotConstraintPriority: a.slotConstraintPriority,
    }, {
      date: b.slot.date,
      startTime: b.slot.startTime,
      endTime: b.slot.endTime,
      shiftType: b.slot.shiftType,
      role: b.slot.role,
      requirementPriority: b.requirementPriority,
      eligibleCount: b.eligibleCount,
      dedicatedEligibleCount: b.dedicatedEligibleCount,
      topDedication: b.topDedication,
      slotConstraintPriority: b.slotConstraintPriority,
    })
  );

  return scored.map((s) => s.slot);
}

export async function applyBulkFillWithSession(
  planningMonthId: string,
  slots: UnfilledSlotPreview[],
  options?: { limit?: number; aiGenerated?: boolean }
): Promise<BulkFillResult> {
  const limit = options?.limit ?? 40;
  const result: BulkFillResult = { applied: 0, skipped: 0, errors: [] };

  const session = await PlanningSession.open(planningMonthId);
  const batch = await orderSlotsForFill(session, slots.slice(0, limit));
  const createdIds: string[] = [];

  for (const slot of batch) {
    try {
      if (session.isSlotFilled(slot)) {
        result.skipped++;
        continue;
      }

      const picked = await session.pickBestAgent({
        siteId: slot.siteId,
        date: slot.date,
        shiftType: slot.shiftType,
        startTime: slot.startTime,
        endTime: slot.endTime,
        role: slot.role,
      });

      if (!picked) {
        result.skipped++;
        continue;
      }

      const hours = calculateShiftHours(slot.startTime, slot.endTime);
      const aiExplanation = options?.aiGenerated
        ? `${picked.agentName} — meilleure affectation (score ${picked.score})`
        : undefined;

      const assignment = await prisma.assignment.create({
        data: {
          ...buildAssignmentWriteData({
            planningMonthId,
            agentId: picked.agentId,
            siteId: slot.siteId,
            requirementId: slot.requirementId,
            date: new Date(slot.date),
            shiftType: slot.shiftType,
            role: slot.role,
            startTime: slot.startTime,
            endTime: slot.endTime,
            hours,
          }),
          aiGenerated: options?.aiGenerated ?? false,
          aiConfidence: options?.aiGenerated ? picked.score : null,
          aiExplanation: aiExplanation ?? null,
        },
      });

      session.trackAssignment(assignment);
      createdIds.push(assignment.id);
      result.applied++;
    } catch (err) {
      result.errors.push(
        `${slot.siteName} ${slot.date}: ${err instanceof Error ? err.message : "Erreur"}`
      );
      result.skipped++;
    }
  }

  if (createdIds.length > 0) {
    const { validateAssignment, syncAgentContractHoursAlert } = await import(
      "@/services/rules/validate-assignment"
    );
    const outcomes = await Promise.all(createdIds.map((id) => validateAssignment(id)));
    const failedIds = outcomes.filter((o) => o.status === "error").map((o) => o.assignmentId);

    if (failedIds.length > 0) {
      await rollbackAssignments(failedIds);
      result.applied -= failedIds.length;
      result.skipped += failedIds.length;
      result.errors.push(`${failedIds.length} affectation(s) rejetée(s) par le moteur de règles`);
    }

    const seenAgents = new Set<string>();
    for (const outcome of outcomes) {
      if (failedIds.includes(outcome.assignmentId)) continue;
      const row = await prisma.assignment.findUnique({
        where: { id: outcome.assignmentId },
        select: { agentId: true },
      });
      if (row) seenAgents.add(row.agentId);
    }
    await Promise.all(
      [...seenAgents].map((agentId) => syncAgentContractHoursAlert(agentId, planningMonthId))
    );
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
