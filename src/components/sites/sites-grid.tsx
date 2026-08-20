"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SiteListItem } from "@/services/sites/queries";
import { MoreHorizontal, Pencil, Trash2, Eye, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteSite } from "@/actions/sites";
import { SiteFormDialog } from "@/components/sites/site-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SiteLabel } from "@/components/shared/site-label";
import { formatDays, SHIFT_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { fr } from "@/lib/i18n/fr";

type SitesGridProps = {
  sites: SiteListItem[];
};

function CoverageBadge({ total, filled, missing }: { total: number; filled: number; missing: number }) {
  if (total === 0) {
    return (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        {fr.sites.noCoverageData}
      </Badge>
    );
  }

  const pct = Math.round((filled / total) * 100);
  const isComplete = missing === 0;

  return (
    <div className="space-y-1">
      <Badge
        variant="outline"
        className={cn(
          "gap-1.5 font-normal",
          isComplete
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            isComplete ? "bg-emerald-500" : "bg-amber-500"
          )}
        />
        {filled}/{total} {fr.sites.slotsCovered}
      </Badge>
      {!isComplete && (
        <p className="text-xs text-muted-foreground">
          {fr.sites.missingSlots}: {missing} ({pct}%)
        </p>
      )}
    </div>
  );
}

export function SitesGrid({ sites }: SitesGridProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editSite, setEditSite] = useState<SiteListItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function handleDelete() {
    if (!deleteId) return;
    startTransition(async () => {
      const result = await deleteSite(deleteId);
      if (result.success) {
        toast.success(fr.sites.siteDeleted);
        setDeleteId(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (sites.length === 0) {
    return (
      <Card className="md:col-span-2">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {fr.sites.noSites}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {sites.map((site) => {
        const onlyAgents = site.habitualAgents.filter((a) => a.ruleType === "ONLY");
        const preferredAgents = site.habitualAgents.filter((a) => a.ruleType === "PREFERRED");

        return (
          <Card key={site.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-2">
                  <Link href={`/sites/${site.id}`} className="hover:opacity-80">
                    <SiteLabel name={site.name} className="text-sm font-semibold" />
                  </Link>
                  <CardDescription>{site.client ?? site.address ?? fr.sites.noClient}</CardDescription>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={site.active ? "default" : "secondary"}>
                    {site.active ? fr.common.active : fr.common.inactive}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/sites/${site.id}`)}>
                        <Eye className="mr-2 size-4" />
                        {fr.common.viewDetails}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditSite(site)}>
                        <Pencil className="mr-2 size-4" />
                        {fr.common.edit}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteId(site.id)}>
                        <Trash2 className="mr-2 size-4" />
                        {fr.common.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-4">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {fr.sites.coverageTitle} — {site.coverage.monthLabel}
                </p>
                <CoverageBadge
                  total={site.coverage.total}
                  filled={site.coverage.filled}
                  missing={site.coverage.missing}
                />
              </div>

              {(onlyAgents.length > 0 || preferredAgents.length > 0) && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Users className="size-3.5" />
                    {fr.sites.habitualAgents}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {onlyAgents.map((a) => (
                      <Badge key={a.id} variant="outline" className="font-normal">
                        {a.name}
                      </Badge>
                    ))}
                    {preferredAgents.map((a) => (
                      <Badge key={a.id} variant="outline" className="font-normal opacity-80">
                        {a.name}
                        <span className="ml-1 text-[10px] text-muted-foreground">pref.</span>
                      </Badge>
                    ))}
                  </div>
                  {site.hasPolyvalentPool && (
                    <p className="text-xs text-muted-foreground">+ {fr.sites.polyvalentPool}</p>
                  )}
                </div>
              )}

              <div className="mt-auto">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {fr.sites.requirements} ({site.requirements.length})
                </p>
                <ul className="space-y-1 text-sm">
                  {site.requirements.slice(0, 3).map((req) => (
                    <li key={req.id} className="text-muted-foreground">
                      {req.label ?? SHIFT_TYPE_LABELS[req.shiftType]}: {req.startTime}–
                      {req.endTime} ×{req.agentCount}
                      <span className="ml-1 text-xs">({formatDays(req.days)})</span>
                    </li>
                  ))}
                  {site.requirements.length > 3 && (
                    <li className="text-xs text-muted-foreground">
                      +{site.requirements.length - 3} {fr.sites.more}
                    </li>
                  )}
                  {site.requirements.length === 0 && (
                    <li className="text-xs text-amber-600">{fr.sites.noRequirementsWarning}</li>
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <SiteFormDialog
        open={Boolean(editSite)}
        onOpenChange={(open) => !open && setEditSite(null)}
        site={editSite}
      />

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={fr.sites.deleteSite}
        description={fr.sites.deleteSiteDesc}
        loading={pending}
        onConfirm={handleDelete}
      />
    </>
  );
}
