import type { Agent, AgentSiteRule, ShiftType } from "@prisma/client";
import type { PositionRole } from "@prisma/client";
import { getDayOfWeek, isWeekendDateKey, parseDateKey } from "@/lib/planning/dates";

export type ConstrainedAgent = Agent & { siteRules: AgentSiteRule[] };

export type SlotPickContext = {
  siteId: string;
  date: Date | string;
  startTime: string;
  endTime?: string;
  shiftType?: ShiftType;
  role?: PositionRole | null;
};

/** Higher = agent has more rules / less flexible → assign to matching slots first. */
export function getAgentConstraintScore(agent: ConstrainedAgent): number {
  let score = 0;
  const activeRules = agent.siteRules.filter((r) => r.active !== false);

  for (const rule of activeRules) {
    if (rule.ruleType === "ONLY") score += 55;
    else if (rule.ruleType === "PREFERRED") score += 22;
    if (rule.allowedDays.length > 0) score += 35;
    if (rule.fixedStartTime) score += 18;
    if (rule.fixedEndTime) score += 12;
    if (rule.maxHours != null) score += 8;
  }

  if (agent.siteRestrictionType === "ONLY") score += 45;
  else if (agent.siteRestrictionType === "PREFERRED") score += 18;

  if (agent.dayOnly) score += 28;
  if (agent.nightForbidden) score += 24;
  if (!agent.canWorkNight) score += 16;
  if (agent.preferredDays.length > 0) score += 12;
  if (!agent.overtimeAllowed) score += 6;

  const isPolyvalent = agent.siteRestrictionType === "ANY" && activeRules.length === 0;
  if (isPolyvalent) score -= 80;

  return score;
}

/** Higher = agent is the natural owner of this slot. Polyvalent agents score negative. */
export function getAgentSlotDedication(
  agent: ConstrainedAgent,
  ctx: SlotPickContext
): number {
  const date = typeof ctx.date === "string" ? parseDateKey(ctx.date) : ctx.date;
  const day = getDayOfWeek(date);
  const siteRule = agent.siteRules.find((r) => r.siteId === ctx.siteId && r.active !== false);

  if (siteRule?.ruleType === "BLOCKED") return -200;

  let dedication = 0;

  if (siteRule?.ruleType === "ONLY") dedication += 120;
  else if (siteRule?.ruleType === "PREFERRED") dedication += 45;

  if (siteRule?.allowedDays && siteRule.allowedDays.length > 0) {
    dedication += siteRule.allowedDays.includes(day) ? 90 : -120;
  }

  if (siteRule?.fixedStartTime && siteRule.fixedStartTime === ctx.startTime) {
    dedication += 35;
  } else if (siteRule?.fixedStartTime) {
    dedication -= 20;
  }

  if (agent.siteRestrictionType === "ONLY" && !siteRule) {
    dedication += agent.allowedSiteIds.includes(ctx.siteId) ? 60 : -80;
  }

  if (ctx.shiftType === "NIGHT" || ctx.startTime >= "20:00") {
    if (agent.dayOnly || agent.nightForbidden || !agent.canWorkNight) dedication -= 60;
  } else if (ctx.shiftType === "DAY" || ctx.startTime < "18:00") {
    if (agent.nightForbidden) dedication += 15;
  }

  if (agent.preferredDays.length > 0) {
    dedication += agent.preferredDays.includes(day) ? 20 : -15;
  }

  const isPolyvalent = agent.siteRestrictionType === "ANY" && !siteRule;
  if (isPolyvalent) dedication -= 100;

  return dedication;
}

export function isPolyvalentAgent(agent: ConstrainedAgent): boolean {
  const activeRules = agent.siteRules.filter((r) => r.active !== false);
  return agent.siteRestrictionType === "ANY" && activeRules.length === 0;
}

/** Sites that have at least one ONLY-tagged agent in the pool. */
export function buildDedicatedSiteIds(agents: ConstrainedAgent[]): Set<string> {
  const ids = new Set<string>();
  for (const agent of agents) {
    for (const rule of agent.siteRules) {
      if (rule.active !== false && rule.ruleType === "ONLY") {
        ids.add(rule.siteId);
      }
    }
  }
  return ids;
}

export function agentBelongsToSitePool(agent: ConstrainedAgent, siteId: string): boolean {
  return agent.siteRules.some((r) => r.siteId === siteId && r.active !== false);
}

/**
 * On dedicated sites (e.g. LE DOUZE), only pool agents or polyvalent backups may work.
 * Agents like YAHMADI (PREFERRED on other sites only) are excluded.
 */
export function isAgentAllowedOnDedicatedSite(
  agent: ConstrainedAgent,
  siteId: string,
  dedicatedSiteIds: Set<string>
): boolean {
  if (!dedicatedSiteIds.has(siteId)) return true;
  if (agentBelongsToSitePool(agent, siteId)) return true;
  if (isPolyvalentAgent(agent)) return true;
  return false;
}

export function compareAgentsForSlot(
  a: { agentId: string; score: number; accepted: boolean },
  b: { agentId: string; score: number; accepted: boolean },
  agentsById: Map<string, ConstrainedAgent>,
  ctx: SlotPickContext
): number {
  if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
  if (!a.accepted) return b.score - a.score;

  const agentA = agentsById.get(a.agentId);
  const agentB = agentsById.get(b.agentId);
  if (!agentA || !agentB) return b.score - a.score;

  const dedA = getAgentSlotDedication(agentA, ctx);
  const dedB = getAgentSlotDedication(agentB, ctx);
  if (dedA !== dedB) return dedB - dedA;

  const conA = getAgentConstraintScore(agentA);
  const conB = getAgentConstraintScore(agentB);
  if (conA !== conB) return conB - conA;

  const polyA = isPolyvalentAgent(agentA) ? 1 : 0;
  const polyB = isPolyvalentAgent(agentB) ? 1 : 0;
  if (polyA !== polyB) return polyA - polyB;

  return b.score - a.score;
}

export type SlotOrderInput = {
  date: string;
  startTime: string;
  endTime?: string;
  shiftType?: ShiftType;
  role?: PositionRole | null;
  requirementPriority?: number;
  eligibleCount: number;
  dedicatedEligibleCount: number;
  topDedication: number;
  slotConstraintPriority: number;
};

/** Fill specialized slots (e.g. MBODJI Mon/Tue LE DOUZE) before polyvalent-friendly ones. */
export function compareSlotFillOrder(a: SlotOrderInput, b: SlotOrderInput): number {
  if (a.slotConstraintPriority !== b.slotConstraintPriority) {
    return b.slotConstraintPriority - a.slotConstraintPriority;
  }

  if (a.dedicatedEligibleCount !== b.dedicatedEligibleCount) {
    if (a.dedicatedEligibleCount === 1) return -1;
    if (b.dedicatedEligibleCount === 1) return 1;
    return a.dedicatedEligibleCount - b.dedicatedEligibleCount;
  }

  if (a.topDedication !== b.topDedication) return b.topDedication - a.topDedication;

  const aLead = a.role === "TEAM_LEADER" ? 0 : 1;
  const bLead = b.role === "TEAM_LEADER" ? 0 : 1;
  if (aLead !== bLead) return aLead - bLead;

  const aPri = a.requirementPriority ?? 0;
  const bPri = b.requirementPriority ?? 0;
  if (aPri !== bPri) return bPri - aPri;

  if (a.eligibleCount !== b.eligibleCount) return a.eligibleCount - b.eligibleCount;

  const aW = isWeekendDateKey(a.date) ? 0 : 1;
  const bW = isWeekendDateKey(b.date) ? 0 : 1;
  if (aW !== bW) return aW - bW;

  return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
}

export function scoreSlotConstraintPriority(
  agents: ConstrainedAgent[],
  acceptedAgentIds: Set<string>,
  ctx: SlotPickContext
): {
  slotConstraintPriority: number;
  dedicatedEligibleCount: number;
  topDedication: number;
} {
  let slotConstraintPriority = 0;
  let dedicatedEligibleCount = 0;
  let topDedication = -999;

  for (const agent of agents) {
    if (!acceptedAgentIds.has(agent.id)) continue;

    const dedication = getAgentSlotDedication(agent, ctx);
    topDedication = Math.max(topDedication, dedication);

    if (dedication >= 100) {
      dedicatedEligibleCount++;
      slotConstraintPriority += 180;
    } else if (dedication >= 50) {
      slotConstraintPriority += 80;
    }
  }

  if (dedicatedEligibleCount === 1) slotConstraintPriority += 400;
  if (dedicatedEligibleCount === 0 && acceptedAgentIds.size > 0) {
    slotConstraintPriority -= 50;
  }

  return { slotConstraintPriority, dedicatedEligibleCount, topDedication };
}
