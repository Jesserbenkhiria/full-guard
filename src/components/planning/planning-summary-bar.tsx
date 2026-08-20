"use client";

import type { PlanningSummary } from "@/types/planning";
import { fr } from "@/lib/i18n/fr";
import { cn } from "@/lib/utils";

type PlanningSummaryBarProps = {
  summary: PlanningSummary;
};

export function PlanningSummaryBar({ summary }: PlanningSummaryBarProps) {
  const coveragePct =
    summary.totalSlots > 0
      ? Math.round((summary.filledSlots / summary.totalSlots) * 100)
      : 0;

  return (
    <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <SummaryStat label={fr.planning.summarySites} value={summary.siteCount} />
      <SummaryStat label={fr.planning.summarySlots} value={summary.totalSlots} />
      <SummaryStat
        label={fr.planning.summaryFilled}
        value={summary.filledSlots}
        className="text-emerald-700 dark:text-emerald-400"
      />
      <SummaryStat
        label={fr.planning.summaryMissing}
        value={summary.missingSlots}
        className={summary.missingSlots > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
      />
      <SummaryStat
        label={fr.planning.summaryAlerts}
        value={summary.alertCount}
        className={summary.alertCount > 0 ? "text-red-700 dark:text-red-400" : undefined}
        suffix={
          summary.totalSlots > 0 ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {coveragePct}% couverture
            </span>
          ) : undefined
        }
      />
    </div>
  );
}

function SummaryStat({
  label,
  value,
  className,
  suffix,
}: {
  label: string;
  value: number;
  className?: string;
  suffix?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", className)}>
        {value}
        {suffix}
      </p>
    </div>
  );
}
