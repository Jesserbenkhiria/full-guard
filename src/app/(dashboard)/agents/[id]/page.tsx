import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AgentDetailClient } from "@/components/agents/agent-detail-client";
import { getAgentById, getSitesForSelect } from "@/actions/agents";
import { fr } from "@/lib/i18n/fr";

export const dynamic = "force-dynamic";

type AgentDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { id } = await params;

  let agent: Awaited<ReturnType<typeof getAgentById>> = null;
  let sites: Awaited<ReturnType<typeof getSitesForSelect>> = [];

  try {
    [agent, sites] = await Promise.all([getAgentById(id), getSitesForSelect()]);
  } catch {
    notFound();
  }

  if (!agent) notFound();

  return (
    <DashboardShell title={agent.lastName} description={fr.agents.profile}>
      <AgentDetailClient agent={agent} sites={sites} />
    </DashboardShell>
  );
}
