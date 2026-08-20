import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AgentsPageClient } from "@/components/agents/agents-page-client";
import { getAgentsList, getSitesForSelect } from "@/actions/agents";
import { fr } from "@/lib/i18n/fr";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  let agents: Awaited<ReturnType<typeof getAgentsList>> = [];
  let sites: Awaited<ReturnType<typeof getSitesForSelect>> = [];

  try {
    [agents, sites] = await Promise.all([getAgentsList(), getSitesForSelect()]);
  } catch {
    agents = [];
    sites = [];
  }

  return (
    <DashboardShell title={fr.agents.title} description={fr.agents.description}>
      <AgentsPageClient agents={agents} sites={sites} />
    </DashboardShell>
  );
}
