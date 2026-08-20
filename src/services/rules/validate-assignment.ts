import { AlertSeverity } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createConfiguredEngine } from "@/services/rules/load-engine";
import { planningValidatedRule } from "@/services/rules/builtin-rules";
import { contractHoursRule } from "@/services/rules/business-rules";
import { buildExtendedContext } from "@/services/rules/context";
import { getValidationResults } from "@/services/rules/rule-result";
import type { RuleResult } from "@/types";

const CONTRACT_ALERT_CODES = [
  "CONTRACT_HOURS_EXCEEDED",
  "OVERTIME_NOT_ALLOWED",
  "OVERTIME_WARNING",
] as const;

function toAlertSeverity(severity: RuleResult["severity"]): AlertSeverity {
  if (severity === "ERROR") return AlertSeverity.ERROR;
  return AlertSeverity.WARNING;
}

async function loadAgentAvailability(agentId: string, monthStart: Date, monthEnd: Date) {
  const [vacations, absences, medicalVisits, unavailableDates] = await Promise.all([
    prisma.vacation.findMany({
      where: {
        agentId,
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
    }),
    prisma.absence.findMany({
      where: {
        agentId,
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
    }),
    prisma.medicalVisit.findMany({
      where: {
        agentId,
        date: { gte: monthStart, lte: monthEnd },
      },
    }),
    prisma.unavailableDate.findMany({
      where: {
        agentId,
        date: { gte: monthStart, lte: monthEnd },
      },
    }),
  ]);

  return { vacations, absences, medicalVisits, unavailableDates };
}

export type ValidationOutcome = {
  assignmentId: string;
  results: RuleResult[];
  status: "valid" | "warning" | "error";
};

export async function validateAssignment(assignmentId: string): Promise<ValidationOutcome> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      agent: { include: { siteRules: { where: { active: true } } } },
      site: true,
      planningMonth: true,
    },
  });

  if (!assignment) {
    throw new Error("Affectation introuvable");
  }

  const { year, month } = assignment.planningMonth;
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);

  const [monthAssignments, availability, engine] = await Promise.all([
    prisma.assignment.findMany({
      where: { planningMonthId: assignment.planningMonthId },
    }),
    loadAgentAvailability(assignment.agentId, monthStart, monthEnd),
    createConfiguredEngine(),
  ]);

  const ctx = buildExtendedContext(
    assignment,
    monthAssignments,
    availability.vacations,
    availability.medicalVisits,
    availability.unavailableDates.map((u) => u.date),
    availability.absences
  );

  const results = await engine.evaluate(ctx);
  const { hasError, hasWarning, failures } = getValidationResults(results);

  await prisma.alert.deleteMany({ where: { assignmentId } });

  const assignmentFailures = failures.filter(
    (f) => !CONTRACT_ALERT_CODES.includes(f.ruleCode as (typeof CONTRACT_ALERT_CODES)[number])
  );

  if (assignmentFailures.length > 0) {
    await prisma.alert.createMany({
      data: assignmentFailures.map((f) => ({
        planningMonthId: assignment.planningMonthId,
        agentId: assignment.agentId,
        siteId: assignment.siteId,
        assignmentId: assignment.id,
        ruleCode: f.ruleCode || "UNKNOWN",
        severity: toAlertSeverity(f.severity),
        message: f.message,
      })),
    });
  } else if (!hasError && !hasWarning) {
    const validated = await planningValidatedRule.check(ctx);
    await prisma.alert.create({
      data: {
        planningMonthId: assignment.planningMonthId,
        agentId: assignment.agentId,
        siteId: assignment.siteId,
        assignmentId: assignment.id,
        ruleCode: "PLANNING_VALIDATED",
        severity: AlertSeverity.SUCCESS,
        message: validated.message,
      },
    });
  }

  const status = hasError ? "error" : hasWarning ? "warning" : "valid";

  return { assignmentId, results, status };
}

/** Agent-level contract hours alert (one per agent/month, not per assignment). */
export async function syncAgentContractHoursAlert(
  agentId: string,
  planningMonthId: string
): Promise<void> {
  const planningMonth = await prisma.planningMonth.findUnique({
    where: { id: planningMonthId },
  });
  if (!planningMonth) return;

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { siteRules: { where: { active: true } } },
  });
  if (!agent?.contractHours) return;

  const monthStart = new Date(planningMonth.year, planningMonth.month - 1, 1);
  const monthEnd = new Date(planningMonth.year, planningMonth.month, 0, 23, 59, 59);

  const monthAssignments = await prisma.assignment.findMany({
    where: { planningMonthId, agentId },
  });

  await prisma.alert.deleteMany({
    where: {
      planningMonthId,
      agentId,
      ruleCode: { in: [...CONTRACT_ALERT_CODES] },
      assignmentId: null,
    },
  });

  if (monthAssignments.length === 0) return;

  const availability = await loadAgentAvailability(agentId, monthStart, monthEnd);
  const reference = monthAssignments[0];
  const site = await prisma.site.findUnique({ where: { id: reference.siteId } });

  const ctx = buildExtendedContext(
    {
      ...reference,
      agent,
      site: site ?? { name: "" },
    },
    monthAssignments,
    availability.vacations,
    availability.medicalVisits,
    availability.unavailableDates.map((u) => u.date),
    availability.absences
  );

  const result = await contractHoursRule.check(ctx);
  if (!result.valid && result.message) {
    await prisma.alert.create({
      data: {
        planningMonthId,
        agentId,
        ruleCode: result.ruleCode || "CONTRACT_HOURS_EXCEEDED",
        severity: toAlertSeverity(result.severity),
        message: result.message,
      },
    });
  }
}

export async function revalidateAfterChange(assignmentId: string): Promise<ValidationOutcome> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { agentId: true, planningMonthId: true, date: true },
  });
  if (!assignment) {
    throw new Error("Affectation introuvable");
  }

  const outcome = await validateAssignment(assignmentId);

  const sameDay = await prisma.assignment.findMany({
    where: {
      planningMonthId: assignment.planningMonthId,
      agentId: assignment.agentId,
      date: assignment.date,
      id: { not: assignmentId },
    },
  });

  for (const other of sameDay) {
    await validateAssignment(other.id);
  }

  await syncAgentContractHoursAlert(assignment.agentId, assignment.planningMonthId);

  return outcome;
}

export async function validatePlanningMonth(planningMonthId: string): Promise<{
  errorCount: number;
  warningCount: number;
  validCount: number;
}> {
  const assignments = await prisma.assignment.findMany({
    where: { planningMonthId },
    select: { id: true, agentId: true },
  });

  let errorCount = 0;
  let warningCount = 0;
  let validCount = 0;
  const seenAgents = new Set<string>();

  for (const { id, agentId } of assignments) {
    const outcome = await validateAssignment(id);
    if (outcome.status === "error") errorCount++;
    else if (outcome.status === "warning") warningCount++;
    else validCount++;
    seenAgents.add(agentId);
  }

  for (const agentId of seenAgents) {
    await syncAgentContractHoursAlert(agentId, planningMonthId);
  }

  return { errorCount, warningCount, validCount };
}
