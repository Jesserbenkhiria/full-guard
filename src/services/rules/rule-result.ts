import type { RuleResult, RuleSeverity } from "@/types";

export function rulePass(message = ""): RuleResult {
  return { valid: true, severity: "INFO", ruleCode: "", message };
}

export function ruleFail(severity: RuleSeverity, message: string, ruleCode = ""): RuleResult {
  return { valid: false, severity, ruleCode, message };
}

export function withRuleCode(result: RuleResult, ruleCode: string): RuleResult {
  return { ...result, ruleCode };
}

export function getValidationResults(results: RuleResult[]): {
  hasError: boolean;
  hasWarning: boolean;
  failures: RuleResult[];
} {
  const failures = results.filter((r) => !r.valid && r.message);
  return {
    hasError: failures.some((r) => r.severity === "ERROR"),
    hasWarning: failures.some((r) => r.severity === "WARNING"),
    failures,
  };
}

export function worstSeverity(results: RuleResult[]): RuleSeverity {
  if (results.some((r) => !r.valid && r.severity === "ERROR")) return "ERROR";
  if (results.some((r) => !r.valid && r.severity === "WARNING")) return "WARNING";
  return "INFO";
}
