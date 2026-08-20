"use client";

import { Sparkles, Printer } from "lucide-react";
import { DayShiftCell } from "@/components/planning/day-shift-cell";
import { Button } from "@/components/ui/button";
import { buildSitePrintUrl } from "@/components/planning/site-print-calendar";
import { formatShiftLabel } from "@/lib/planning/shift-templates";
import {
  formatDayOfMonth,
  formatShortWeekday,
  isWeekendDateKey,
} from "@/lib/planning/dates";
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

type SitePlanningViewProps = {
  sites: SitePlanningGroup[];
  days: string[];
  year: number;
  month: number;
  missingBySite?: Map<string, number>;
  onSlotClick: (slot: PlanningSlotDto) => void;
  onOpenSiteSuggestions?: (siteId: string, siteName: string) => void;
};

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
  missingBySite,
  onSlotClick,
  onOpenSiteSuggestions,
}: SitePlanningViewProps) {
  function handlePrintSite(siteId: string) {
    window.open(buildSitePrintUrl(year, month, siteId), "_blank");
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
          site.shiftRows.filter((row) =>
            days.some((d) => (row.slotsByDate[d]?.length ?? 0) > 0)
          )
        );

        if (visibleRows.length === 0) return null;

        const siteStyle = getSiteColorStyle(site.siteName);
        const missingCount = missingBySite?.get(site.siteId) ?? 0;

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
              <div className="ml-auto flex flex-wrap items-center gap-2">
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
                      const weekend = isWeekendDateKey(day);
                      return (
                        <th
                          key={day}
                          className={cn(
                            "min-w-[100px] border-b px-1 py-2 text-center font-medium",
                            weekend && "bg-muted/50"
                          )}
                        >
                          <div className="flex flex-col items-center leading-tight">
                            <span
                              className={cn(
                                "text-[10px] uppercase",
                                weekend ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
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
                          const weekend = isWeekendDateKey(day);

                          return (
                            <td
                              key={day}
                              className={cn(
                                "p-1 align-top",
                                weekend && "bg-muted/20",
                                slots.length === 0 && "bg-muted/5"
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
    </div>
  );
}
