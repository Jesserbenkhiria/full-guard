import type { Agent, AgentSiteRule, Assignment, PositionRole, ShiftType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatAgentName } from "@/lib/constants";
import { calculateShiftHours, sumAssignmentHours } from "@/lib/planning/hours";
import { getDayOfWeek } from "@/lib/planning/dates";
import { createConfiguredEngine } from "@/services/rules/load-engine";
import type { RulesEngine } from "@/services/rules/engine";
import { buildExtendedContext } from "@/services/rules/context";
import { getValidationResults } from "@/services/rules/rule-result";
import type { RuleResult } from "@/types";
import type { SuggestionReasonDetail } from "@/types/planning";

export type VacationSlot = {
  planningMonthId: string;
  siteId: string;
  date: Date;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  role?: PositionRole;
  excludeAssignmentId?: string;
};

export type EligibleAgent = {
  agentId: string;
  agentName: string;
  results: RuleResult[];
};

export type AgentAvailability = {
  vacations: { startDate: Date; endDate: Date }[];
  absences: { startDate: Date; endDate: Date }[];
  medicalVisits: { date: Date; time: string }[];
  unavailableDates: Date[];
};

export async function loadAgentsAvailabilityForDate(
  agentIds: string[],
  date: Date
): Promise<Map<string, AgentAvailability>> {
  if (agentIds.length === 0) return new Map();

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const [vacations, absences, medicalVisits, unavailableDates] = await Promise.all([
    prisma.vacation.findMany({
      where: {
        agentId: { in: agentIds },
        startDate: { lte: dayEnd },
        endDate: { gte: dayStart },
      },
    }),
    prisma.absence.findMany({
      where: {
        agentId: { in: agentIds },
        startDate: { lte: dayEnd },
        endDate: { gte: dayStart },
      },
    }),
    prisma.medicalVisit.findMany({
      where: { agentId: { in: agentIds }, date: dayStart },
    }),
    prisma.unavailableDate.findMany({
      where: { agentId: { in: agentIds }, date: dayStart },
    }),
  ]);

  const map = new Map<string, AgentAvailability>();
  for (const id of agentIds) {
    map.set(id, { vacations: [], absences: [], medicalVisits: [], unavailableDates: [] });
  }
  for (const v of vacations) {
    map.get(v.agentId)?.vacations.push(v);
  }
  for (const a of absences) {
    map.get(a.agentId)?.absences.push(a);
  }
  for (const m of medicalVisits) {
    map.get(m.agentId)?.medicalVisits.push(m);
  }
  for (const u of unavailableDates) {
    map.get(u.agentId)?.unavailableDates.push(u.date);
  }
  return map;
}

async function loadAgentAvailabilityForDate(
  agentId: string,
  date: Date
): Promise<AgentAvailability> {
  const map = await loadAgentsAvailabilityForDate([agentId], date);
  return map.get(agentId) ?? { vacations: [], absences: [], medicalVisits: [], unavailableDates: [] };
}

function buildHypotheticalAssignment(
  slot: VacationSlot,
  agent: Agent & { siteRules: AgentSiteRule[] },
  siteName: string
): Assignment & {
  agent: Agent & { siteRules: AgentSiteRule[] };
  site: { name: string };
} {
  return {
    id: slot.excludeAssignmentId ?? `hypothetical-${agent.id}`,
    planningMonthId: slot.planningMonthId,
    agentId: agent.id,
    siteId: slot.siteId,
    requirementId: null,
    date: slot.date,
    shiftType: slot.shiftType,
    role: slot.role ?? "AGENT",
    startTime: slot.startTime,
    endTime: slot.endTime,
    hours: null,
    notes: null,
    aiGenerated: false,
    aiConfidence: null,
    aiExplanation: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    agent,
    site: { name: siteName },
  };
}

/**
 * RULE 13 — Returns agents eligible for a slot (no ERROR-level rule failures).
 * Scoring / auto-fill can be layered on top of this result.
 */
export function mapRuleResultsToReasons(results: RuleResult[]): {
  reasons: string[];
  reasonDetails: SuggestionReasonDetail[];
  hasError: boolean;
  hasWarning: boolean;
} {
  const reasons: string[] = [];
  const reasonDetails: SuggestionReasonDetail[] = [];
  const failures = results.filter((r) => !r.valid && r.message);

  for (const f of failures) {
    const type = f.severity === "ERROR" ? "error" : f.severity === "WARNING" ? "warn" : "ok";
    if (!reasons.includes(f.message)) {
      reasons.push(f.message);
      reasonDetails.push({ text: f.message, type });
    }
  }

  if (failures.length === 0) {
    reasons.push("Conforme aux règles métier");
    reasonDetails.push({ text: "Conforme aux règles métier", type: "ok" });
  }

  return {
    reasons,
    reasonDetails,
    hasError: failures.some((f) => f.severity === "ERROR"),
    hasWarning: failures.some((f) => f.severity === "WARNING"),
  };
}

export async function evaluateAgentForSlot(
  agent: Agent & { siteRules: AgentSiteRule[] },
  slot: VacationSlot,
  siteName: string,
  monthAssignments: Assignment[],
  availability: AgentAvailability,
  engine?: RulesEngine
): Promise<{ eligible: boolean; results: RuleResult[] }> {
  const agentMonthAssignments = monthAssignments.filter(
    (a) => a.agentId === agent.id && a.id !== slot.excludeAssignmentId
  );

  const hypothetical = buildHypotheticalAssignment(slot, agent, siteName);
  const withHypothetical = [...agentMonthAssignments, hypothetical];

  const ctx = buildExtendedContext(
    hypothetical,
    withHypothetical,
    availability.vacations,
    availability.medicalVisits,
    availability.unavailableDates,
    availability.absences
  );

  const rulesEngine = engine ?? (await createConfiguredEngine());
  const results = await rulesEngine.evaluate(ctx);
  const { hasError } = getValidationResults(results);

  return { eligible: !hasError, results };
}

export async function getEligibleAgents(slot: VacationSlot): Promise<EligibleAgent[]> {
  const [agents, site, monthAssignments, engine] = await Promise.all([
    prisma.agent.findMany({
      where: { active: true },
      include: { siteRules: { where: { active: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.site.findUnique({ where: { id: slot.siteId }, select: { name: true } }),
    prisma.assignment.findMany({
      where: { planningMonthId: slot.planningMonthId },
    }),
    createConfiguredEngine(),
  ]);

  const siteName = site?.name ?? "";
  const availabilityMap = await loadAgentsAvailabilityForDate(
    agents.map((a) => a.id),
    slot.date
  );

  const eligible: EligibleAgent[] = [];

  for (const agent of agents) {
    const availability = availabilityMap.get(agent.id)!;
    const { eligible: isEligible, results } = await evaluateAgentForSlot(
      agent,
      slot,
      siteName,
      monthAssignments,
      availability,
      engine
    );

    if (isEligible) {
      eligible.push({
        agentId: agent.id,
        agentName: formatAgentName(agent.firstName, agent.lastName),
        results,
      });
    }
  }

  return eligible;
}

/** Score boost for agents dedicated to this site/day (e.g. MBODJI on LE DOUZE Mon/Tue). */
export function scoreSiteFit(
  agent: Agent & { siteRules: AgentSiteRule[] },
  siteId: string,
  date: Date
): number {
  let bonus = 0;
  const siteRule = agent.siteRules.find((r) => r.siteId === siteId && r.active !== false);

  if (siteRule?.ruleType === "ONLY") bonus += 18;
  if (siteRule?.ruleType === "PREFERRED") bonus += 8;

  if (siteRule?.allowedDays && siteRule.allowedDays.length > 0) {
    const day = getDayOfWeek(date);
    if (siteRule.allowedDays.includes(day)) bonus += 12;
    else bonus -= 40;
  }

  if (agent.siteRestrictionType === "ANY" && !siteRule) {
    bonus -= 30;
  }

  return bonus;
}
