"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles, Printer, ShieldCheck, Trash2 } from "lucide-react";
import type { PlanningStatus } from "@prisma/client";
import { DayShiftCell } from "@/components/planning/day-shift-cell";
import { Button } from "@/components/ui/button";
import { buildSitePrintUrl } from "@/components/planning/site-print-calendar";
import { formatShiftLabel, mergeShiftRowsByHours } from "@/lib/planning/shift-templates";
import {
  formatDayOfMonth,
  formatShortWeekday,
} from "@/lib/planning/dates";
import {
  weekendCellClass,
  weekendHeaderClass,
  weekendHeaderLabelClass,
} from "@/lib/planning/weekend-style";
import type { PlanningSlotDto, ShiftPlanningRow, SitePlanningGroup } from "@/types/planning";
import {
  SHIFT_TYPE_LABELS,
  POSITION_ROLE_LABELS,
} from "@/lib/constants";
import { fr } from "@/lib/i18n/fr";
import { SiteLabel } from "@/components/shared/site-label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getSiteColorStyle } from "@/lib/site-colors";
import { deleteSiteAssignments, runSitePlanningValidation } from "@/actions/planning";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

type SitePlanningViewProps = {
  sites: SitePlanningGroup[];
  days: string[];
  year: number;
  month: number;
  planningMonthId: string;
  missingBySite?: Map<string, number>;
  onSlotClick: (slot: PlanningSlotDto) => void;
  onOpenSiteSuggestions?: (siteId: string, siteName: string) => void;
};

function siteStatusLabel(status: PlanningStatus): string {
  switch (status) {
    case "VALIDATED":
      return fr.planning.siteStatusValidated;
    case "IN_REVIEW":
      return fr.planning.siteStatusInReview;
    default:
      return fr.planning.siteStatusDraft;
  }
}

function siteStatusBadgeClass(status: PlanningStatus): string {
  switch (status) {
    case "VALIDATED":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
    case "IN_REVIEW":
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
    default:
      return "border-muted bg-muted/50 text-muted-foreground";
  }
}

function countSiteAssignments(site: SitePlanningGroup): number {
  let count = 0;
  for (const row of site.shiftRows) {
    for (const slots of Object.values(row.slotsByDate)) {
      for (const slot of slots) {
        if (slot.assignment) count++;
      }
    }
  }
  return count;
}

function sortShiftRows(rows: ShiftPlanningRow[]): ShiftPlanningRow[] {
  return [...rows].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    if (a.role !== b.role) return a.role === "TEAM_LEADER" ? -1 : 1;
    return a.label.localeCompare(b.label, "fr");
  });
}

function ShiftRowLabel({ row }: { row: ShiftPlanningRow }) {
  const isTeamLeader = row.role === "TEAM_LEADER";

  return (
    <div className="flex min-w-[160px] flex-col gap-1 py-1">
      <span className="font-semibold leading-tight text-foreground">
        {formatShiftLabel(row.startTime, row.endTime)}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-muted-foreground">
          {SHIFT_TYPE_LABELS[row.shiftType]}
        </span>
        <Badge
          variant={isTeamLeader ? "default" : "outline"}
          className={cn(
            "h-4 px-1 text-[9px] font-normal",
            isTeamLeader && "bg-amber-600 hover:bg-amber-600"
          )}
        >
          {POSITION_ROLE_LABELS[row.role]}
        </Badge>
      </div>
      <span className="text-[10px] leading-snug text-muted-foreground">{row.label}</span>
    </div>
  );
}

export function SitePlanningView({
  sites,
  days,
  year,
  month,
  planningMonthId,
  missingBySite,
  onSlotClick,
  onOpenSiteSuggestions,
}: SitePlanningViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clearTarget, setClearTarget] = useState<{
    siteId: string;
    siteName: string;
    assignmentCount: number;
  } | null>(null);

  function handlePrintSite(siteId: string) {
    window.open(buildSitePrintUrl(year, month, siteId), "_blank");
  }

  function handleClearSiteAssignments() {
    if (!clearTarget) return;

    startTransition(async () => {
      const result = await deleteSiteAssignments(planningMonthId, clearTarget.siteId);
      if (result.success) {
        const { deletedCount } = result.data;
        if (deletedCount === 0) {
          toast.info(fr.planning.deleteSiteAssignmentsEmpty);
        } else {
          toast.success(fr.planning.deleteSiteAssignmentsSuccess, {
            description: `${clearTarget.siteName} — ${deletedCount} affectation${deletedCount > 1 ? "s" : ""} supprimée${deletedCount > 1 ? "s" : ""}`,
          });
        }
        setClearTarget(null);
        router.refresh();
      } else {
        toast.error(result.error || fr.planning.deleteSiteAssignments);
      }
    });
  }

  function handleValidateSite(siteId: string, siteName: string) {
    startTransition(async () => {
      const result = await runSitePlanningValidation(planningMonthId, siteId);
      if (result.success) {
        const { errorCount, warningCount, validCount } = result.data;
        toast.success(fr.planning.siteValidationComplete, {
          description: `${siteName} — ${errorCount} ${fr.planning.error.toLowerCase()}, ${warningCount} ${fr.planning.warning.toLowerCase()}, ${validCount} ${fr.planning.validated.toLowerCase()}`,
        });
        router.refresh();
      } else {
        toast.error(result.error || fr.planning.siteValidationFailed);
        router.refresh();
      }
    });
  }

  if (sites.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">{fr.planning.noSites}</p>
    );
  }

  return (
    <div className="space-y-6">
      {sites.map((site) => {
        const visibleRows = sortShiftRows(
          mergeShiftRowsByHours(
            site.shiftRows.filter((row) =>
              days.some((d) => (row.slotsByDate[d]?.length ?? 0) > 0)
            )
          )
        );

        if (visibleRows.length === 0) return null;

        const siteStyle = getSiteColorStyle(site.siteName);
        const missingCount = missingBySite?.get(site.siteId) ?? 0;
        const assignmentCount = countSiteAssignments(site);

        return (
          <section
            key={site.siteId}
            className="overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 border-b px-4 py-3",
                siteStyle.badgeClass
              )}
            >
              <span className={cn("size-2.5 shrink-0 rounded-full", siteStyle?.dotClass)} />
              <SiteLabel
                name={site.siteName}
                className="text-sm font-bold uppercase tracking-wide"
              />
              <span className="text-xs text-muted-foreground">
                {visibleRows.length} {visibleRows.length <= 1 ? "poste" : "postes"}
              </span>
              <Badge
                variant="outline"
                className={cn("h-6 text-[10px] font-medium", siteStatusBadgeClass(site.validationStatus))}
              >
                {siteStatusLabel(site.validationStatus)}
              </Badge>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 bg-background/80 text-xs"
                  disabled={pending || site.validationStatus === "VALIDATED"}
                  onClick={() => handleValidateSite(site.siteId, site.siteName)}
                >
                  <ShieldCheck className="size-3.5" />
                  {fr.planning.validateSite}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 bg-background/80 text-xs"
                  disabled={false}
                  onClick={() => handlePrintSite(site.siteId)}
                >
                  <Printer className="size-3.5" />
                  {fr.planning.printSiteCalendar}
                </Button>
                {onOpenSiteSuggestions && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 bg-background/80 text-xs"
                    disabled={missingCount === 0}
                    onClick={() => onOpenSiteSuggestions(site.siteId, site.siteName)}
                  >
                    <Sparkles className="size-3.5" />
                    {fr.planning.generateSuggestions}
                    {missingCount > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        {missingCount}
                      </span>
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 bg-background/80 text-xs text-destructive hover:text-destructive"
                  disabled={pending || assignmentCount === 0}
                  onClick={() =>
                    setClearTarget({
                      siteId: site.siteId,
                      siteName: site.siteName,
                      assignmentCount,
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                  {fr.planning.deleteSiteAssignments}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto p-4">
              <table className="w-full min-w-max border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 min-w-[160px] border-b bg-muted/60 px-3 py-2 text-left font-medium">
                      {fr.planning.shiftColumn}
                    </th>
                    {days.map((day) => {
                      const weekend = weekendHeaderClass(day);
                      return (
                        <th
                          key={day}
                          className={cn(
                            "min-w-[100px] border-b px-1 py-2 text-center font-medium",
                            weekend || "bg-muted/40"
                          )}
                        >
                          <div className="flex flex-col items-center leading-tight">
                            <span
                              className={cn(
                                "text-[10px] uppercase font-semibold",
                                weekendHeaderLabelClass(day)
                              )}
                            >
                              {formatShortWeekday(day)}
                            </span>
                            <span className="text-sm font-bold">{formatDayOfMonth(day)}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const isTeamLeader = row.role === "TEAM_LEADER";

                    return (
                      <tr
                        key={row.requirementId}
                        className={cn(
                          "border-b last:border-0",
                          isTeamLeader && "bg-amber-50/20 dark:bg-amber-950/10"
                        )}
                      >
                        <td
                          className={cn(
                            "sticky left-0 z-10 border-r bg-background px-3 py-2 align-top",
                            isTeamLeader && "bg-amber-50/40 dark:bg-amber-950/20"
                          )}
                        >
                          <ShiftRowLabel row={row} />
                        </td>
                        {days.map((day) => {
                          const slots = row.slotsByDate[day] ?? [];
                          const weekendBg = weekendCellClass(day);

                          return (
                            <td
                              key={day}
                              className={cn(
                                "p-1 align-top",
                                weekendBg,
                                slots.length === 0 && !weekendBg && "bg-muted/5"
                              )}
                            >
                              {slots.length > 0 ? (
                                <DayShiftCell
                                  slots={slots}
                                  isTeamLeader={isTeamLeader}
                                  onSlotClick={onSlotClick}
                                />
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <ConfirmDialog
        open={clearTarget != null}
        onOpenChange={(open) => {
          if (!open) setClearTarget(null);
        }}
        title={fr.planning.deleteSiteAssignments}
        description={
          clearTarget
            ? `${fr.planning.deleteSiteAssignmentsDesc} (${clearTarget.siteName} — ${clearTarget.assignmentCount} affectation${clearTarget.assignmentCount > 1 ? "s" : ""})`
            : fr.planning.deleteSiteAssignmentsDesc
        }
        onConfirm={handleClearSiteAssignments}
        loading={pending}
      />
    </div>
  );
}
