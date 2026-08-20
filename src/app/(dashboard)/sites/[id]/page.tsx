import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SiteDetailClient } from "@/components/sites/site-detail-client";
import { getSiteById } from "@/actions/sites";
import { fr } from "@/lib/i18n/fr";

export const dynamic = "force-dynamic";

type SiteDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SiteDetailPage({ params }: SiteDetailPageProps) {
  const { id } = await params;

  let site: Awaited<ReturnType<typeof getSiteById>> = null;

  try {
    site = await getSiteById(id);
  } catch {
    notFound();
  }

  if (!site) notFound();

  return (
    <DashboardShell title={site.name} description={fr.sites.requirementsConfig}>
      <SiteDetailClient site={site} />
    </DashboardShell>
  );
}
