import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SitesPageClient } from "@/components/sites/sites-page-client";
import { getSitesPageData } from "@/services/sites/queries";
import { fr } from "@/lib/i18n/fr";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  let sites: Awaited<ReturnType<typeof getSitesPageData>> = [];

  try {
    sites = await getSitesPageData();
  } catch {
    sites = [];
  }

  return (
    <DashboardShell title={fr.sites.title} description={fr.sites.description}>
      <SitesPageClient sites={sites} />
    </DashboardShell>
  );
}
