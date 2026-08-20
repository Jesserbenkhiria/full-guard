"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { SiteListItem } from "@/services/sites/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteFormDialog } from "@/components/sites/site-form-dialog";
import { SitesGrid } from "@/components/sites/sites-grid";
import { fr } from "@/lib/i18n/fr";

type SitesPageClientProps = {
  sites: SiteListItem[];
};

export function SitesPageClient({ sites }: SitesPageClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const readyCount = sites.filter((s) => s.active && s.requirements.length > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight">
            {sites.length}{" "}
            <span className="text-base font-normal text-muted-foreground">
              {fr.sites.sitesCountLabel}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            {readyCount} {fr.sites.planningReady} · {fr.sites.operationalHint}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="mr-2 size-4" />
          {fr.sites.addSite}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{fr.sites.directory}</CardTitle>
          <CardDescription>{fr.sites.directoryDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <SitesGrid sites={sites} />
          </div>
        </CardContent>
      </Card>

      <SiteFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
