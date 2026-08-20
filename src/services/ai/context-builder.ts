import { prisma } from "@/lib/db";
import { formatAgentName } from "@/lib/constants";
import { calculateShiftHours, sumAssignmentHours } from "@/lib/planning/hours";
import { toDateKey, getDayOfWeek } from "@/lib/planning/dates";
import { deriveLegacyRestriction } from "@/lib/site-authorization";
import { loadAgentsAvailabilityForDate, type AgentAvailability } from "@/services/rules/eligibility";
import { scoreAssignmentFit, teamAverageHours } from "@/services/planning/score-fit";
import type { AgentWithRules, PlanningSession } from "@/services/ai/planning-session";
import type {
  AgentCandidateContext,
  PlanningAssistantContext,
  VacationRequirementContext,
} from "@/services/ai/types";
import type { Assignment, PositionRole, ShiftType } from "@prisma/client";

export type SlotContextInput = {
  planningMonthId: string;
  siteId: string;
  date: Date;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  role?: PositionRole;
};

export async function buildPlanningAssistantContext(
  input: SlotContextInput,
  session?: PlanningSession
): Promise<PlanningAssistantContext> {
  if (session) {
    return buildFromSession(input, session);
  }

  const planningMonth = await prisma.planningMonth.findUnique({
    where: { id: input.planningMonthId },
  });
  if (!planningMonth) throw new Error("Mois de planification introuvable");

  const [site, agents, monthAssignments, activeRules, siteNameMap] = await Promise.all([
    prisma.site.findUnique({ where: { id: input.siteId } }),
    prisma.agent.findMany({
      where: { active: true },
      include: {
        siteRules: { where: { active: true }, include: { site: { select: { name: true } } } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.assignment.findMany({
      where: { planningMonthId: input.planningMonthId },
      include: { site: { select: { name: true } } },
    }),
    prisma.rule.findMany({
      where: { enabled: true },
      select: { code: true, name: true, description: true },
      orderBy: { code: "asc" },
    }),
    prisma.site.findMany({ select: { id: true, name: true } }).then((sites) => {
      const map = new Map<string, string>();
      for (const s of sites) map.set(s.id, s.name);
      return map;
    }),
  ]);

  if (!site) throw new Error("Site introuvable");

  const shiftHours = calculateShiftHours(input.startTime, input.endTime);
  const dateKey = toDateKey(input.date);
  const availabilityMap = await loadAgentsAvailabilityForDate(
    agents.map((a) => a.id),
    input.date
  );
  const avgHours = teamAverageHours(monthAssignments, agents.length);

  const requirement: VacationRequirementContext = {
    site: { id: site.id, name: site.name },
    date: dateKey,
    startTime: input.startTime,
    endTime: input.endTime,
    shiftType: input.shiftType,
    role: input.role ?? "AGENT",
    shiftHours,
  };

  const candidates: AgentCandidateContext[] = agents.map((agent) =>
    toCandidate({
      agent: agent as AgentWithRules,
      siteId: input.siteId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      shiftHours,
      monthAssignments,
      availability: availabilityMap.get(agent.id)!,
      siteNameOf: (id) => siteNameMap.get(id) ?? id,
      teamAvgHours: avgHours,
      engineFitScore: 0,
    })
  );

  candidates.sort((a, b) => b.engineFitScore - a.engineFitScore);
  const top = candidates.slice(0, 12);

  return {
    requirement: {
      ...requirement,
      date: `${requirement.date} (${getDayOfWeek(input.date)})`,
    },
    candidates: top,
    activeRules: activeRules.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
    })),
  };
}

async function buildFromSession(
  input: SlotContextInput,
  session: PlanningSession
): Promise<PlanningAssistantContext> {
  const site = await prisma.site.findUnique({ where: { id: input.siteId } });
  if (!site) throw new Error("Site introuvable");

  const shiftHours = calculateShiftHours(input.startTime, input.endTime);
  const dateKey = toDateKey(input.date);
  const availabilityMap = await session.availabilityFor(input.date);

  const requirement: VacationRequirementContext = {
    site: { id: site.id, name: site.name },
    date: dateKey,
    startTime: input.startTime,
    endTime: input.endTime,
    shiftType: input.shiftType,
    role: input.role ?? "AGENT",
    shiftHours,
  };

  const eligibleAgents: typeof session.agents = [];
  const engineScores = new Map<string, number>();
  const ranked = await session.getSuggestions(input);
  for (const suggestion of ranked) {
    engineScores.set(suggestion.agentId, suggestion.score);
    if (suggestion.accepted) {
      const agent = session.agentsById.get(suggestion.agentId);
      if (agent) eligibleAgents.push(agent);
    }
  }

  const pool =
    eligibleAgents.length > 0
      ? eligibleAgents.slice(0, 12)
      : ranked
          .slice(0, 8)
          .map((s) => session.agentsById.get(s.agentId))
          .filter((agent): agent is AgentWithRules => Boolean(agent));
  const avgHours = teamAverageHours(session.monthAssignments, session.agents.length);

  const candidates: AgentCandidateContext[] = pool.map((agent) =>
    toCandidate({
      agent,
      siteId: input.siteId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      shiftHours,
      monthAssignments: session.monthAssignments,
      availability: availabilityMap.get(agent.id)!,
      siteNameOf: (id) => session.siteName(id),
      teamAvgHours: avgHours,
      engineFitScore: engineScores.get(agent.id) ?? 0,
    })
  );

  candidates.sort((a, b) => b.engineFitScore - a.engineFitScore);

  return {
    requirement: {
      ...requirement,
      date: `${requirement.date} (${getDayOfWeek(input.date)})`,
    },
    candidates,
    activeRules: session.activeRules.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
    })),
  };
}

function toCandidate(input: {
  agent: AgentWithRules;
  siteId: string;
  date: Date;
  startTime: string;
  endTime: string;
  shiftHours: number;
  monthAssignments: Assignment[];
  availability: AgentAvailability;
  siteNameOf: (siteId: string) => string;
  teamAvgHours: number;
  engineFitScore: number;
}): AgentCandidateContext {
  const agentAssignments = input.monthAssignments.filter((a) => a.agentId === input.agent.id);
  const siteAssignments = agentAssignments.filter((a) => a.siteId === input.siteId);
  const workedHours = sumAssignmentHours(agentAssignments);
  const remainingHours =
    input.agent.contractHours != null ? Math.max(0, input.agent.contractHours - workedHours) : null;

  const legacy = deriveLegacyRestriction(
    input.agent.siteRules.map((r) => ({
      siteId: r.siteId,
      ruleType: r.ruleType,
      allowedDays: r.allowedDays,
      fixedStartTime: r.fixedStartTime,
      fixedEndTime: r.fixedEndTime,
      maxHours: r.maxHours,
      active: r.active,
    }))
  );

  const allowedSiteNames =
    legacy.allowedSiteIds.length > 0
      ? legacy.allowedSiteIds.map((id) => input.siteNameOf(id))
      : legacy.siteRestrictionType === "ANY"
        ? ["Tous sites (polyvalent)"]
        : [];

  const fit = scoreAssignmentFit({
    agent: input.agent,
    siteId: input.siteId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    shiftHours: input.shiftHours,
    monthAssignments: input.monthAssignments,
    siteHistoryCount: siteAssignments.length,
    teamAvgHours: input.teamAvgHours,
    warningCount: 0,
  });

  return {
    agentId: input.agent.id,
    name: formatAgentName(input.agent.firstName, input.agent.lastName),
    contractHours: input.agent.contractHours,
    remainingHours,
    assignmentCount: agentAssignments.length,
    siteAssignmentCount: siteAssignments.length,
    allowedSites: allowedSiteNames,
    siteRules: input.agent.siteRules.map((r) => ({
      siteName: input.siteNameOf(r.siteId),
      ruleType: r.ruleType,
      allowedDays: r.allowedDays,
      fixedStartTime: r.fixedStartTime,
      fixedEndTime: r.fixedEndTime,
      maxHours: r.maxHours,
    })),
    restrictions: {
      canWorkNight: input.agent.canWorkNight,
      dayOnly: input.agent.dayOnly,
      nightForbidden: input.agent.nightForbidden,
      overtimeAllowed: input.agent.overtimeAllowed,
      preferredDays: input.agent.preferredDays,
    },
    availability: {
      onVacation: input.availability.vacations.length > 0,
      onAbsence: input.availability.absences.length > 0,
      medicalVisit: input.availability.medicalVisits.length > 0,
      unavailable: input.availability.unavailableDates.length > 0,
    },
    previousAssignments: agentAssignments.slice(-8).map((a) => ({
      date: toDateKey(a.date),
      siteName: input.siteNameOf(a.siteId),
      startTime: a.startTime,
      endTime: a.endTime,
    })),
    engineFitScore: input.engineFitScore || Math.max(0, Math.min(100, 55 + fit.delta)),
    rankingSignals: fit.signals,
  };
}
