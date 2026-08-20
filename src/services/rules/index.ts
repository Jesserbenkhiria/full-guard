/**
 * Rules engine public API.
 * Rules are configured in the DB (`Rule` model) and loaded via `createConfiguredEngine`.
 */
export { createConfiguredEngine } from "@/services/rules/load-engine";
export { createRulesEngine, type PlanningRule, type RuleContext } from "@/services/rules/engine";
export { getValidationResults, rulePass, ruleFail } from "@/services/rules/rule-result";
export {
  validateAssignment,
  validatePlanningMonth,
  revalidateAfterChange,
  syncAgentContractHoursAlert,
  type ValidationOutcome,
} from "@/services/rules/validate-assignment";
export {
  validateSiteForExport,
  validateMonthForExport,
  computeSiteExportCheck,
  computeMonthExportCheck,
} from "@/services/rules/export-check";
export { validatePlanningGate, type PlanningGateResult, type SiteExportCheck } from "@/services/rules/validate-planning-gate";
export {
  getEligibleAgents,
  evaluateAgentForSlot,
  loadAgentsAvailabilityForDate,
  mapRuleResultsToReasons,
  scoreSiteFit,
  type VacationSlot,
  type EligibleAgent,
  type AgentAvailability,
} from "@/services/rules/eligibility";
export { RULE_REGISTRY, ASSIGNMENT_RULE_CODES } from "@/services/rules/registry";
