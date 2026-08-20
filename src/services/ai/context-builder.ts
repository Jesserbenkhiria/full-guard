import { prisma } from "@/lib/db";
import { formatAgentName } from "@/lib/constants";
import { calculateShiftHours, sumAssignmentHours } from "@/lib/planning/hours";
import { toDateKey, getDayOfWeek } from "@/lib/planning/dates";
import { deriveLegacyRestriction } from "@/lib/site-authorization";
import { loadAgentsAvailabilityForDate } from "@/services/rules/eligibility";
import type { PlanningSession } from "@/services/ai/planning-session";
import type {
  AgentCandidateContext,
  PlanningAssistantContext,
  VacationRequirementContext,
} from "@/services/ai/types";
import type { PositionRole, ShiftType } from "@prisma/client";

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

  const requirement: VacationRequirementContext = {
    site: { id: site.id, name: site.name },
    date: dateKey,
    startTime: input.startTime,
    endTime: input.endTime,
    shiftType: input.shiftType,
    role: input.role ?? "AGENT",
    shiftHours,
  };

  const candidates: AgentCandidateContext[] = agents.map((agent) => {
    const agentAssignments = monthAssignments.filter((a) => a.agentId === agent.id);
    const siteAssignments = agentAssignments.filter((a) => a.siteId === input.siteId);
    const workedHours = sumAssignmentHours(agentAssignments);
    const remainingHours =
      agent.contractHours != null ? Math.max(0, agent.contractHours - workedHours) : null;

    const legacy = deriveLegacyRestriction(
      agent.siteRules.map((r) => ({
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
        ? legacy.allowedSiteIds.map((id) => siteNameMap.get(id) ?? id)
        : legacy.siteRestrictionType === "ANY"
          ? ["Tous sites (polyvalent)"]
          : [];

    const availability = availabilityMap.get(agent.id)!;

    return {
      agentId: agent.id,
      name: formatAgentName(agent.firstName, agent.lastName),
      contractHours: agent.contractHours,
      remainingHours,
      assignmentCount: agentAssignments.length,
      siteAssignmentCount: siteAssignments.length,
      allowedSites: allowedSiteNames,
      siteRules: agent.siteRules.map((r) => ({
        siteName: r.site.name,
        ruleType: r.ruleType,
        allowedDays: r.allowedDays,
        fixedStartTime: r.fixedStartTime,
        fixedEndTime: r.fixedEndTime,
        maxHours: r.maxHours,
      })),
      restrictions: {
        canWorkNight: agent.canWorkNight,
        dayOnly: agent.dayOnly,
        nightForbidden: agent.nightForbidden,
        overtimeAllowed: agent.overtimeAllowed,
        preferredDays: agent.preferredDays,
      },
      availability: {
        onVacation: availability.vacations.length > 0,
        onAbsence: availability.absences.length > 0,
        medicalVisit: availability.medicalVisits.length > 0,
        unavailable: availability.unavailableDates.length > 0,
      },
      previousAssignments: agentAssignments.slice(-8).map((a) => ({
        date: toDateKey(a.date),
        siteName: a.site.name,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
    };
  });

  return {
    requirement: {
      ...requirement,
      date: `${requirement.date} (${getDayOfWeek(input.date)})`,
    },
    candidates,
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
  const slot = session.toVacationSlot(input);

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
  for (const agent of session.agents) {
    const availability = availabilityMap.get(agent.id)!;
    const blocked =
      availability.vacations.length > 0 ||
      availability.absences.length > 0 ||
      availability.medicalVisits.length > 0 ||
      availability.unavailableDates.length > 0;
    if (blocked) continue;

    const { eligible } = await session.evaluateAgent(agent.id, slot);
    if (eligible) eligibleAgents.push(agent);
  }

  const agents = eligibleAgents.length > 0 ? eligibleAgents : session.agents;

  const candidates: AgentCandidateContext[] = agents.map((agent) => {
    const agentAssignments = session.monthAssignments.filter((a) => a.agentId === agent.id);
    const siteAssignments = agentAssignments.filter((a) => a.siteId === input.siteId);
    const workedHours = sumAssignmentHours(agentAssignments);
    const remainingHours =
      agent.contractHours != null ? Math.max(0, agent.contractHours - workedHours) : null;

    const legacy = deriveLegacyRestriction(
      agent.siteRules.map((r) => ({
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
        ? legacy.allowedSiteIds.map((id) => session.siteName(id))
        : legacy.siteRestrictionType === "ANY"
          ? ["Tous sites (polyvalent)"]
          : [];

    const availability = availabilityMap.get(agent.id)!;

    return {
      agentId: agent.id,
      name: formatAgentName(agent.firstName, agent.lastName),
      contractHours: agent.contractHours,
      remainingHours,
      assignmentCount: agentAssignments.length,
      siteAssignmentCount: siteAssignments.length,
      allowedSites: allowedSiteNames,
      siteRules: agent.siteRules.map((r) => ({
        siteName: session.siteName(r.siteId),
        ruleType: r.ruleType,
        allowedDays: r.allowedDays,
        fixedStartTime: r.fixedStartTime,
        fixedEndTime: r.fixedEndTime,
        maxHours: r.maxHours,
      })),
      restrictions: {
        canWorkNight: agent.canWorkNight,
        dayOnly: agent.dayOnly,
        nightForbidden: agent.nightForbidden,
        overtimeAllowed: agent.overtimeAllowed,
        preferredDays: agent.preferredDays,
      },
      availability: {
        onVacation: availability.vacations.length > 0,
        onAbsence: availability.absences.length > 0,
        medicalVisit: availability.medicalVisits.length > 0,
        unavailable: availability.unavailableDates.length > 0,
      },
      previousAssignments: agentAssignments.slice(-8).map((a) => ({
        date: toDateKey(a.date),
        siteName: session.siteName(a.siteId),
        startTime: a.startTime,
        endTime: a.endTime,
      })),
    };
  });

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
