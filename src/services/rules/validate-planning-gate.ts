import { PlanningStatus } from "@prisma/client";
import { validateAllSitesPlanningGate } from "@/services/rules/validate-site-planning-gate";

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
 * Validate all active sites, then derive month status from per-site results.
 */
export async function validatePlanningGate(
  planningMonthId: string
): Promise<PlanningGateResult> {
  const result = await validateAllSitesPlanningGate(planningMonthId);

  return {
    canValidate: result.canValidate,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    validCount: result.validCount,
    missingSlots: result.missingSlots,
    blockingMessages: result.blockingMessages,
    status: result.status,
  };
}
