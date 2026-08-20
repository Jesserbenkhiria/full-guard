import { prisma } from "@/lib/db";
import { createRulesEngine, type RulesEngine } from "@/services/rules/engine";
import { RULE_REGISTRY, ASSIGNMENT_RULE_CODES } from "@/services/rules/registry";

/** DB may list alias codes that share one implementation. */
const RULE_ALIASES: Record<string, string> = {
  OVERTIME_NOT_ALLOWED: "CONTRACT_HOURS_EXCEEDED",
  OVERTIME_WARNING: "CONTRACT_HOURS_EXCEEDED",
};

let cachedEngine: RulesEngine | null = null;
let cacheKey = "";

export async function createConfiguredEngine(options?: {
  includePlanningRules?: boolean;
}): Promise<RulesEngine> {
  const includePlanning = options?.includePlanningRules ?? false;

  const dbRules = await prisma.rule.findMany({
    select: { code: true, enabled: true },
    orderBy: { code: "asc" },
  });

  const catalog = new Map(dbRules.map((r) => [r.code, r.enabled]));

  function isRuleEnabled(code: string): boolean {
    if (catalog.size === 0) return true;
    if (!catalog.has(code)) return true;
    return catalog.get(code)!;
  }

  const enabledCodes = new Set<string>();
  for (const code of ASSIGNMENT_RULE_CODES) {
    if (isRuleEnabled(code)) enabledCodes.add(code);
  }
  for (const { code, enabled } of dbRules) {
    if (enabled) enabledCodes.add(code);
  }
  if (includePlanning && isRuleEnabled("SITE_COVERAGE_MISSING")) {
    enabledCodes.add("SITE_COVERAGE_MISSING");
  }
  const key = `${[...enabledCodes].sort().join(",")}:${includePlanning}`;
  if (cachedEngine && cacheKey === key) return cachedEngine;

  const engine = createRulesEngine();
  const registeredImpl = new Set<string>();

  for (const code of enabledCodes) {
    if (!includePlanning && code === "SITE_COVERAGE_MISSING") continue;
    const canonical = RULE_ALIASES[code] ?? code;
    const impl = RULE_REGISTRY[canonical];
    if (impl && !registeredImpl.has(canonical)) {
      engine.register(impl);
      registeredImpl.add(canonical);
    }
  }

  cachedEngine = engine;
  cacheKey = key;
  return engine;
}

export function clearRulesEngineCache() {
  cachedEngine = null;
  cacheKey = "";
}
