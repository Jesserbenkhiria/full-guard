import type { PlanningRule } from "@/services/rules/engine";
import { ruleFail, rulePass } from "@/services/rules/rule-result";
import type { ExtendedRuleContext } from "@/services/rules/context";

/** RULE 10 — placeholder per assignment; month-level check in validatePlanningGate. */
export const siteCoverageRule: PlanningRule = {
  code: "SITE_COVERAGE_MISSING",
  name: "Postes non couverts",
  check(_ctx: ExtendedRuleContext) {
    return rulePass();
  },
};

export type PlanningCoverageResult = {
  valid: boolean;
  severity: "INFO" | "WARNING" | "ERROR";
  ruleCode: string;
  message: string;
  missingSlots: number;
};

export function evaluateSiteCoverage(missingSlots: number): PlanningCoverageResult {
  if (missingSlots <= 0) {
    return {
      valid: true,
      severity: "INFO",
      ruleCode: "SITE_COVERAGE_MISSING",
      message: "",
      missingSlots: 0,
    };
  }
  return {
    valid: false,
    severity: "ERROR",
    ruleCode: "SITE_COVERAGE_MISSING",
    message: `${missingSlots} poste(s) requis non couvert(s)`,
    missingSlots,
  };
}
