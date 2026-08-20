import {
  AgentSiteRuleType,
  type Agent,
  type PrismaClient,
  type Site,
} from "@prisma/client";
import { deriveLegacyRestriction } from "../src/lib/site-authorization";
import { constraintsToSiteRuleSeeds } from "../src/data/agent-constraints";

type RuleSeed = {
  agentKey: string;
  siteKey: string;
  ruleType: AgentSiteRuleType;
  allowedDays?: import("@prisma/client").DayOfWeek[];
  fixedStartTime?: string;
  fixedEndTime?: string;
  maxHours?: number;
  notes?: string;
};

export const AGENT_SITE_RULE_SEEDS: RuleSeed[] = constraintsToSiteRuleSeeds().map(
  (s) => ({
    agentKey: s.agentKey,
    siteKey: s.siteKey,
    ruleType: s.ruleType === "ONLY" ? AgentSiteRuleType.ONLY : AgentSiteRuleType.PREFERRED,
    allowedDays: s.allowedDays,
    fixedStartTime: s.fixedStartTime,
    fixedEndTime: s.fixedEndTime,
    maxHours: s.maxHours,
    notes: s.notes,
  })
);

export async function seedAgentSiteRules(
  prisma: PrismaClient,
  agents: Map<string, Agent>,
  siteByKey: Record<string, Site>
) {
  await prisma.agentSiteRule.deleteMany();

  const rulesByAgent = new Map<
    string,
    {
      siteId: string;
      ruleType: AgentSiteRuleType;
      allowedDays: import("@prisma/client").DayOfWeek[];
      fixedStartTime?: string | null;
      fixedEndTime?: string | null;
      maxHours?: number | null;
      active: boolean;
    }[]
  >();

  let created = 0;

  for (const seed of AGENT_SITE_RULE_SEEDS) {
    const agent = agents.get(seed.agentKey);
    const site = siteByKey[seed.siteKey];
    if (!agent || !site) {
      console.warn(`⚠ Règle ignorée — agent ou site introuvable: ${seed.agentKey} / ${seed.siteKey}`);
      continue;
    }

    await prisma.agentSiteRule.create({
      data: {
        agentId: agent.id,
        siteId: site.id,
        ruleType: seed.ruleType,
        allowedDays: seed.allowedDays ?? [],
        fixedStartTime: seed.fixedStartTime,
        fixedEndTime: seed.fixedEndTime,
        maxHours: seed.maxHours,
        notes: seed.notes,
      },
    });

    const list = rulesByAgent.get(agent.id) ?? [];
    list.push({
      siteId: site.id,
      ruleType: seed.ruleType,
      allowedDays: seed.allowedDays ?? [],
      fixedStartTime: seed.fixedStartTime ?? null,
      fixedEndTime: seed.fixedEndTime ?? null,
      maxHours: seed.maxHours ?? null,
      active: true,
    });
    rulesByAgent.set(agent.id, list);
    created++;
  }

  for (const [agentId, rules] of rulesByAgent) {
    const legacy = deriveLegacyRestriction(rules);
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        siteRestrictionType: legacy.siteRestrictionType,
        allowedSiteIds: legacy.allowedSiteIds,
      },
    });
  }

  console.log(`   • ${created} profils AgentSiteRule`);
}
