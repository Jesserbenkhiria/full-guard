import type { Agent, AgentSiteRule } from "@prisma/client";
import { shortenSiteName } from "@/lib/site-colors";

export type AgentWithSiteRules = Agent & {
  siteRules: (AgentSiteRule & { site: { name: string } })[];
};

export function formatAgentSiteAuthorization(agent: AgentWithSiteRules): string {
  if (agent.siteRestrictionType === "ANY" && agent.siteRules.length === 0) {
    return "Polyvalent";
  }

  if (agent.siteRules.length > 0) {
    const only = agent.siteRules
      .filter((r) => r.ruleType === "ONLY")
      .map((r) => shortenSiteName(r.site.name));
    const preferred = agent.siteRules
      .filter((r) => r.ruleType === "PREFERRED")
      .map((r) => shortenSiteName(r.site.name));

    if (only.length && preferred.length) {
      return `${only.join(", ")} (+ ${preferred.join(", ")})`;
    }
    if (only.length) return only.join(", ");
    if (preferred.length) return preferred.join(", ");
  }

  if (agent.siteRestrictionType === "ANY") return "Polyvalent";

  return "—";
}

export function isPolyvalentAgent(agent: AgentWithSiteRules): boolean {
  return agent.siteRestrictionType === "ANY" && agent.siteRules.length === 0;
}
