import type { AgentWithSiteRules } from "@/lib/format-agent-sites";

export type AgentListItem = AgentWithSiteRules & {
  vacations: { id: string }[];
  medicalVisits: { id: string }[];
  unavailableDates: { id: string }[];
};

export type AgentOperationalStatus =
  | "active"
  | "inactive"
  | "vacation"
  | "medical"
  | "unavailable";

export function getAgentInitials(firstName: string, lastName: string): string {
  const compact = lastName.replace(/\s+/g, "");
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  return `${lastName.charAt(0)}${firstName.charAt(0)}`.toUpperCase();
}

export function getAgentAvatarHue(firstName: string, lastName: string): number {
  const seed = `${lastName}${firstName}`.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return seed % 360;
}

export function getAgentOperationalStatus(agent: AgentListItem): AgentOperationalStatus {
  if (!agent.active) return "inactive";
  if (agent.vacations.length > 0) return "vacation";
  if (agent.medicalVisits.length > 0) return "medical";
  if (agent.unavailableDates.length > 0) return "unavailable";
  return "active";
}

export function agentHasRestrictions(agent: AgentListItem): boolean {
  return (
    agent.dayOnly ||
    agent.nightForbidden ||
    agent.siteRules.some(
      (r) =>
        r.fixedStartTime ||
        r.fixedEndTime ||
        r.allowedDays.length > 0 ||
        r.maxHours != null
    )
  );
}

export function isAgentConfigured(agent: AgentListItem): boolean {
  return agent.active && agent.contractHours != null;
}

export function computeAgentReadiness(agents: AgentListItem[]) {
  const configured = agents.filter(isAgentConfigured).length;
  const restrictionsToVerify = agents.filter(
    (a) => a.active && agentHasRestrictions(a)
  ).length;
  const onVacation = agents.filter((a) => a.vacations.length > 0).length;

  return {
    total: agents.length,
    configured,
    restrictionsToVerify,
    onVacation,
  };
}

export type AgentSiteBadgeItem = {
  siteName: string;
  ruleType: "ONLY" | "PREFERRED" | "BLOCKED";
};

export function getAgentSiteBadgeItems(agent: AgentListItem): AgentSiteBadgeItem[] | "polyvalent" {
  if (agent.siteRestrictionType === "ANY" && agent.siteRules.length === 0) {
    return "polyvalent";
  }

  if (agent.siteRules.length > 0) {
    const seen = new Set<string>();
    const items: AgentSiteBadgeItem[] = [];

    for (const rule of agent.siteRules) {
      if (rule.ruleType === "BLOCKED") continue;
      const key = `${rule.site.name}:${rule.ruleType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ siteName: rule.site.name, ruleType: rule.ruleType });
    }

    if (items.length > 0) return items;
  }

  if (agent.siteRestrictionType === "ANY") return "polyvalent";

  return [];
}

export function agentMatchesSiteFilter(agent: AgentListItem, siteId: string): boolean {
  if (isPolyvalentAgent(agent)) return true;
  return agent.siteRules.some((r) => r.siteId === siteId);
}

function isPolyvalentAgent(agent: AgentListItem): boolean {
  return agent.siteRestrictionType === "ANY" && agent.siteRules.length === 0;
}
