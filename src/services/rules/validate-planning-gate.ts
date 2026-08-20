import { AlertSeverity, PlanningStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPlanningData } from "@/services/planning/queries";
import { evaluateSiteCoverage } from "@/services/rules/planning-rules";
import { validatePlanningMonth } from "@/services/rules/validate-assignment";

export type SiteExportCheck = {
  ready: boolean;
  errorCount: number;
  warningCount: number;
  errors: string[];
};

export {
  validateSiteForExport,
  validateMonthForExport,
  computeSiteExportCheck,
  computeMonthExportCheck,
} from "@/services/rules/export-check";

export type PlanningGateResult = {
  canValidate: boolean;
  errorCount: number;
  warningCount: number;
  validCount: number;
  missingSlots: number;
  blockingMessages: string[];
  status: PlanningStatus;
};

/**
 * RULE 12 — DRAFT → check all rules → errors block validation; warnings allowed.
 */
export async function validatePlanningGate(
  planningMonthId: string
): Promise<PlanningGateResult> {
  const planningMonth = await prisma.planningMonth.findUnique({
    where: { id: planningMonthId },
  });

  if (!planningMonth) {
    throw new Error("Mois de planification introuvable");
  }

  const assignmentStats = await validatePlanningMonth(planningMonthId);
  const planningData = await getPlanningData(planningMonth.year, planningMonth.month);
  const coverage = evaluateSiteCoverage(planningData.summary.missingSlots);

  const blockingMessages: string[] = [];

  if (assignmentStats.errorCount > 0) {
    blockingMessages.push(
      `${assignmentStats.errorCount} affectation(s) en erreur — correction requise avant validation`
    );
  }

  if (!coverage.valid) {
    blockingMessages.push(coverage.message);
  }

  const canValidate = blockingMessages.length === 0;

  if (canValidate) {
    await prisma.planningMonth.update({
      where: { id: planningMonthId },
      data: {
        status: PlanningStatus.VALIDATED,
        validatedAt: new Date(),
      },
    });

    await prisma.alert.deleteMany({
      where: {
        planningMonthId,
        ruleCode: "SITE_COVERAGE_MISSING",
      },
    });
  } else {
    await prisma.planningMonth.update({
      where: { id: planningMonthId },
      data: {
        status: PlanningStatus.DRAFT,
        validatedAt: null,
      },
    });

    if (!coverage.valid) {
      await prisma.alert.deleteMany({
        where: {
          planningMonthId,
          ruleCode: "SITE_COVERAGE_MISSING",
        },
      });
      await prisma.alert.create({
        data: {
          planningMonthId,
          ruleCode: "SITE_COVERAGE_MISSING",
          severity: AlertSeverity.ERROR,
          message: coverage.message,
        },
      });
    }
  }

  return {
    canValidate,
    errorCount: assignmentStats.errorCount + (coverage.valid ? 0 : 1),
    warningCount: assignmentStats.warningCount,
    validCount: assignmentStats.validCount,
    missingSlots: coverage.missingSlots,
    blockingMessages,
    status: canValidate ? PlanningStatus.VALIDATED : PlanningStatus.DRAFT,
  };
}
