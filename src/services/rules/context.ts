import type { Agent, AgentSiteRule, Assignment, PositionRole } from "@prisma/client";
import type { RuleContext } from "@/services/rules/engine";
import type { AgentSiteRuleInput } from "@/lib/site-authorization";
import { toDateKey } from "@/lib/planning/dates";
import { formatAgentName } from "@/lib/constants";

export type ExtendedRuleContext = RuleContext & {
  agent: Agent;
  agentName: string;
  siteName: string;
  role: PositionRole;
  siteRules: AgentSiteRuleInput[];
  vacations: { startDate: Date; endDate: Date }[];
  absences: { startDate: Date; endDate: Date }[];
  medicalVisits: { date: Date; time: string }[];
  unavailableDates: Date[];
  sameDayAssignments: Assignment[];
  monthAssignments: Assignment[];
};

export function mapSiteRules(rules: AgentSiteRule[]): AgentSiteRuleInput[] {
  return rules.map((r) => ({
    siteId: r.siteId,
    ruleType: r.ruleType,
    allowedDays: r.allowedDays,
    fixedStartTime: r.fixedStartTime,
    fixedEndTime: r.fixedEndTime,
    maxHours: r.maxHours,
    active: r.active,
  }));
}

export function buildExtendedContext(
  assignment: Assignment & {
    agent: Agent & { siteRules?: AgentSiteRule[] };
    site: { name: string };
  },
  monthAssignments: Assignment[],
  vacations: { startDate: Date; endDate: Date }[],
  medicalVisits: { date: Date; time: string }[],
  unavailableDates: Date[],
  absences: { startDate: Date; endDate: Date }[] = []
): ExtendedRuleContext {
  const agentName = formatAgentName(assignment.agent.firstName, assignment.agent.lastName);
  const sameDayAssignments = monthAssignments.filter(
    (a) =>
      a.agentId === assignment.agentId &&
      toDateKey(a.date) === toDateKey(assignment.date) &&
      a.id !== assignment.id
  );

  return {
    agentId: assignment.agentId,
    siteId: assignment.siteId,
    date: assignment.date,
    shiftType: assignment.shiftType,
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    planningMonthId: assignment.planningMonthId,
    assignmentId: assignment.id,
    role: assignment.role,
    agent: assignment.agent,
    agentName,
    siteName: assignment.site.name,
    siteRules: mapSiteRules(assignment.agent.siteRules ?? []),
    vacations,
    absences,
    medicalVisits,
    unavailableDates,
    sameDayAssignments,
    monthAssignments: monthAssignments.filter((a) => a.agentId === assignment.agentId),
  };
}
