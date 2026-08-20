import type { RuleResult } from "@/types";

export type RuleContext = {
  agentId: string;
  siteId?: string;
  date: Date;
  shiftType: "DAY" | "NIGHT" | "CUSTOM" | "OFF";
  startTime: string;
  endTime: string;
  planningMonthId: string;
  assignmentId?: string;
};

export interface PlanningRule {
  code: string;
  name: string;
  check(ctx: RuleContext): Promise<RuleResult> | RuleResult;
}

/**
 * Reusable rules engine — evaluates business constraints for assignments.
 * Each rule returns a standardized result for the alerts center.
 */
export class RulesEngine {
  private rules: PlanningRule[] = [];

  register(rule: PlanningRule): void {
    this.rules.push(rule);
  }

  async evaluate(ctx: RuleContext): Promise<RuleResult[]> {
    const results: RuleResult[] = [];

    for (const rule of this.rules) {
      const result = await rule.check(ctx);
      results.push({
        ...result,
        ruleCode: result.ruleCode || rule.code,
      });
    }

    return results;
  }

  async evaluateAll(contexts: RuleContext[]): Promise<RuleResult[]> {
    const allResults: RuleResult[] = [];
    for (const ctx of contexts) {
      const results = await this.evaluate(ctx);
      allResults.push(...results);
    }
    return allResults;
  }
}

export function createRulesEngine(): RulesEngine {
  return new RulesEngine();
}
