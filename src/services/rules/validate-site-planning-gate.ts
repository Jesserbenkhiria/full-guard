import { AlertSeverity, PlanningStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeSiteCoverage } from "@/lib/planning/summary";
import { getPlanningData } from "@/services/planning/queries";
import { evaluateSiteCoverage } from "@/services/rules/planning-rules";
import {
  syncAgentContractHoursAlert,
  validateAssignment,
  isHoursAlertCode,
} from "@/services/rules/validate-assignment";

export type SitePlanningGateResult = {
  siteId: string;
  canValidate: boolean;
  errorCount: number;
  warningCount: number;
  validCount: number;
  missingSlots: number;
  blockingMessages: string[];
  status: PlanningStatus;
};

export type SiteValidationStats = {
  errorCount: number;
  warningCount: number;
  validCount: number;
};

/**
 * Re-run rules for one site's assignments and cross-site siblings for affected agents.
 * Writes alerts and validation status only — never creates, updates, or deletes assignments.
 */
export async function validatePlanningSite(
  planningMonthId: string,
  siteId: string
): Promise<SiteValidationStats> {
  const siteAssignments = await prisma.assignment.findMany({
    where: { planningMonthId, siteId },
    select: { id: true, agentId: true },
  });

  let errorCount = 0;
  let warningCount = 0;
  let validCount = 0;
  const affectedAgents = new Set<string>();

  for (const { id, agentId } of siteAssignments) {
    const outcome = await validateAssignment(id);
    if (outcome.status === "error") errorCount++;
    else if (outcome.status === "warning") warningCount++;
    else validCount++;
    affectedAgents.add(agentId);
  }

  for (const agentId of affectedAgents) {
    const otherSiteAssignments = await prisma.assignment.findMany({
      where: {
        planningMonthId,
        agentId,
        siteId: { not: siteId },
      },
      select: { id: true },
    });

    for (const { id } of otherSiteAssignments) {
      await validateAssignment(id);
    }

    await syncAgentContractHoursAlert(agentId, planningMonthId);
  }

  return { errorCount, warningCount, validCount };
}

async function countSiteAssignmentStats(
  planningMonthId: string,
  siteId: string
): Promise<SiteValidationStats> {
  const assignments = await prisma.assignment.findMany({
    where: { planningMonthId, siteId },
    select: {
      id: true,
      alerts: {
        where: { resolved: false },
        select: { severity: true, ruleCode: true },
      },
    },
  });

  let errorCount = 0;
  let warningCount = 0;
  let validCount = 0;

  for (const assignment of assignments) {
    const hasError = assignment.alerts.some(
      (a) => a.severity === AlertSeverity.ERROR && !isHoursAlertCode(a.ruleCode)
    );
    const hasWarning = assignment.alerts.some(
      (a) =>
        a.severity === AlertSeverity.WARNING ||
        (a.severity === AlertSeverity.ERROR && isHoursAlertCode(a.ruleCode))
    );
    if (hasError) errorCount++;
    else if (hasWarning) warningCount++;
    else validCount++;
  }

  return { errorCount, warningCount, validCount };
}

async function getSiteAgentLevelErrors(
  planningMonthId: string,
  siteId: string
): Promise<string[]> {
  const agentIds = await prisma.assignment.findMany({
    where: { planningMonthId, siteId },
    select: { agentId: true },
    distinct: ["agentId"],
  });

  if (agentIds.length === 0) return [];

  const alerts = await prisma.alert.findMany({
    where: {
      planningMonthId,
      agentId: { in: agentIds.map((a) => a.agentId) },
      severity: AlertSeverity.ERROR,
      resolved: false,
      assignmentId: null,
    },
    select: { message: true, ruleCode: true },
  });

  return [
    ...new Set(
      alerts
        .filter((a) => !isHoursAlertCode(a.ruleCode))
        .map((a) => a.message)
        .filter(Boolean)
    ),
  ];
}

async function upsertSitePlanningStatus(
  planningMonthId: string,
  siteId: string,
  canValidate: boolean
): Promise<PlanningStatus> {
  const status = canValidate ? PlanningStatus.VALIDATED : PlanningStatus.DRAFT;
  const validatedAt = canValidate ? new Date() : null;

  await prisma.sitePlanningMonth.upsert({
    where: {
      planningMonthId_siteId: { planningMonthId, siteId },
    },
    create: { planningMonthId, siteId, status, validatedAt },
    update: { status, validatedAt },
  });

  return status;
}

async function syncSiteCoverageAlert(
  planningMonthId: string,
  siteId: string,
  coverage: ReturnType<typeof evaluateSiteCoverage>
): Promise<void> {
  await prisma.alert.deleteMany({
    where: {
      planningMonthId,
      siteId,
      ruleCode: "SITE_COVERAGE_MISSING",
    },
  });

  if (!coverage.valid) {
    await prisma.alert.create({
      data: {
        planningMonthId,
        siteId,
        ruleCode: "SITE_COVERAGE_MISSING",
        severity: AlertSeverity.ERROR,
        message: coverage.message,
      },
    });
  }
}

/** Derive month status from per-site validation records. */
export async function syncPlanningMonthStatus(planningMonthId: string): Promise<PlanningStatus> {
  const planningMonth = await prisma.planningMonth.findUnique({
    where: { id: planningMonthId },
    select: { year: true, month: true },
  });
  if (!planningMonth) {
    throw new Error("Mois de planification introuvable");
  }

  const planningData = await getPlanningData(planningMonth.year, planningMonth.month);
  const activeSiteIds = planningData.sites
    .filter((site) =>
      site.shiftRows.some((row) => Object.keys(row.slotsByDate).length > 0)
    )
    .map((site) => site.siteId);

  if (activeSiteIds.length === 0) {
    await prisma.planningMonth.update({
      where: { id: planningMonthId },
      data: { status: PlanningStatus.DRAFT, validatedAt: null },
    });
    return PlanningStatus.DRAFT;
  }

  const siteStatuses = await prisma.sitePlanningMonth.findMany({
    where: {
      planningMonthId,
      siteId: { in: activeSiteIds },
    },
    select: { siteId: true, status: true },
  });

  const statusBySite = new Map(siteStatuses.map((s) => [s.siteId, s.status]));
  const allValidated = activeSiteIds.every(
    (id) => statusBySite.get(id) === PlanningStatus.VALIDATED
  );

  if (allValidated) {
    await prisma.planningMonth.update({
      where: { id: planningMonthId },
      data: { status: PlanningStatus.VALIDATED, validatedAt: new Date() },
    });
    return PlanningStatus.VALIDATED;
  }

  const anyValidated = activeSiteIds.some(
    (id) => statusBySite.get(id) === PlanningStatus.VALIDATED
  );

  const monthStatus = anyValidated ? PlanningStatus.IN_REVIEW : PlanningStatus.DRAFT;

  await prisma.planningMonth.update({
    where: { id: planningMonthId },
    data: { status: monthStatus, validatedAt: null },
  });

  return monthStatus;
}

export async function invalidateSitePlanningStatus(
  planningMonthId: string,
  siteId: string
): Promise<void> {
  await prisma.sitePlanningMonth.upsert({
    where: {
      planningMonthId_siteId: { planningMonthId, siteId },
    },
    create: {
      planningMonthId,
      siteId,
      status: PlanningStatus.DRAFT,
      validatedAt: null,
    },
    update: {
      status: PlanningStatus.DRAFT,
      validatedAt: null,
    },
  });

  await syncPlanningMonthStatus(planningMonthId);
}

export async function validateSitePlanningGate(
  planningMonthId: string,
  siteId: string
): Promise<SitePlanningGateResult> {
  const planningMonth = await prisma.planningMonth.findUnique({
    where: { id: planningMonthId },
  });

  if (!planningMonth) {
    throw new Error("Mois de planification introuvable");
  }

  await validatePlanningSite(planningMonthId, siteId);
  const assignmentStats = await countSiteAssignmentStats(planningMonthId, siteId);
  const planningData = await getPlanningData(planningMonth.year, planningMonth.month);
  const siteGroup = planningData.sites.find((s) => s.siteId === siteId);

  const siteCoverage = siteGroup
    ? evaluateSiteCoverage(computeSiteCoverage(siteGroup).missing)
    : evaluateSiteCoverage(0);

  await syncSiteCoverageAlert(planningMonthId, siteId, siteCoverage);

  const agentErrors = await getSiteAgentLevelErrors(planningMonthId, siteId);
  const blockingMessages: string[] = [];

  if (assignmentStats.errorCount > 0) {
    blockingMessages.push(
      `${assignmentStats.errorCount} affectation(s) en erreur — correction requise avant validation`
    );
  }

  for (const message of agentErrors) {
    blockingMessages.push(message);
  }

  if (!siteCoverage.valid) {
    blockingMessages.push(siteCoverage.message);
  }

  const canValidate = blockingMessages.length === 0;
  const status = await upsertSitePlanningStatus(planningMonthId, siteId, canValidate);
  await syncPlanningMonthStatus(planningMonthId);

  return {
    siteId,
    canValidate,
    errorCount: assignmentStats.errorCount + agentErrors.length + (siteCoverage.valid ? 0 : 1),
    warningCount: assignmentStats.warningCount,
    validCount: assignmentStats.validCount,
    missingSlots: siteCoverage.missingSlots,
    blockingMessages,
    status,
  };
}

export async function validateAllSitesPlanningGate(planningMonthId: string): Promise<{
  siteResults: SitePlanningGateResult[];
  canValidate: boolean;
  errorCount: number;
  warningCount: number;
  validCount: number;
  missingSlots: number;
  blockingMessages: string[];
  status: PlanningStatus;
}> {
  const planningMonth = await prisma.planningMonth.findUnique({
    where: { id: planningMonthId },
  });

  if (!planningMonth) {
    throw new Error("Mois de planification introuvable");
  }

  const planningData = await getPlanningData(planningMonth.year, planningMonth.month);
  const activeSiteIds = planningData.sites
    .filter((site) =>
      site.shiftRows.some((row) => Object.keys(row.slotsByDate).length > 0)
    )
    .map((site) => site.siteId);

  const siteResults: SitePlanningGateResult[] = [];

  for (const siteId of activeSiteIds) {
    siteResults.push(await validateSitePlanningGate(planningMonthId, siteId));
  }

  await prisma.alert.deleteMany({
    where: {
      planningMonthId,
      ruleCode: "SITE_COVERAGE_MISSING",
      siteId: null,
    },
  });

  const status = await syncPlanningMonthStatus(planningMonthId);

  const canValidate = siteResults.every((r) => r.canValidate) && activeSiteIds.length > 0;
  const errorCount = siteResults.reduce((sum, r) => sum + r.errorCount, 0);
  const warningCount = siteResults.reduce((sum, r) => sum + r.warningCount, 0);
  const validCount = siteResults.reduce((sum, r) => sum + r.validCount, 0);
  const missingSlots = siteResults.reduce((sum, r) => sum + r.missingSlots, 0);
  const blockingMessages = siteResults.flatMap((r) => r.blockingMessages);

  return {
    siteResults,
    canValidate,
    errorCount,
    warningCount,
    validCount,
    missingSlots,
    blockingMessages,
    status,
  };
}
