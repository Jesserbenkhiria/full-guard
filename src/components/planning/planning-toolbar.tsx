"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Sparkles, ShieldCheck, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMonthLabel } from "@/lib/planning/dates";
import { fr } from "@/lib/i18n/fr";
import {
  runPlanningValidation,
} from "@/actions/planning";

type PlanningToolbarProps = {
  year: number;
  month: number;
  planningMonthId: string;
  view: "site" | "agent";
  missingCount: number;
  showAllSitesSuggestions?: boolean;
  onOpenSuggestions: () => void;
};

export function PlanningToolbar({
  year,
  month,
  planningMonthId,
  view,
  missingCount,
  showAllSitesSuggestions = true,
  onOpenSuggestions,
}: PlanningToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function navigateMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(date.getFullYear()));
    params.set("month", String(date.getMonth() + 1));
    params.set("view", view);
    router.push(`/planning?${params.toString()}`);
  }

  function setView(next: "site" | "agent") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(year));
    params.set("month", String(month));
    params.set("view", next);
    router.push(`/planning?${params.toString()}`);
  }

  function handleValidate() {
    startTransition(async () => {
      const result = await runPlanningValidation(planningMonthId);
      if (result.success) {
        const { errorCount, warningCount, validCount } = result.data;
        toast.success(fr.planning.validationComplete, {
          description: `${errorCount} ${fr.planning.error.toLowerCase()}, ${warningCount} ${fr.planning.warning.toLowerCase()}, ${validCount} ${fr.planning.validated.toLowerCase()}`,
        });
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleSuggestions() {
    onOpenSuggestions();
  }

  function handleExport() {
    const params = new URLSearchParams({
      year: String(year),
      month: String(month),
      view,
    });
    window.open(`/planning/print?${params.toString()}`, "_blank");
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
          <ChevronLeft className="size-4" />
          <span className="sr-only">{fr.planning.previousMonth}</span>
        </Button>
        <h2 className="min-w-[180px] text-center text-lg font-semibold capitalize">
          {formatMonthLabel(year, month)}
        </h2>
        <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
          <ChevronRight className="size-4" />
          <span className="sr-only">{fr.planning.nextMonth}</span>
        </Button>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as "site" | "agent")}>
        <TabsList>
          <TabsTrigger value="site">{fr.planning.bySite}</TabsTrigger>
          <TabsTrigger value="agent">{fr.planning.byAgent}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        {showAllSitesSuggestions && (
          <Button variant="outline" size="sm" disabled={pending} onClick={handleSuggestions}>
            <Sparkles className="mr-1.5 size-4" />
            {fr.planning.generateSuggestionsAll}
            {missingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {missingCount}
              </span>
            )}
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={pending} onClick={handleValidate}>
          <ShieldCheck className="mr-1.5 size-4" />
          {fr.planning.validatePlanning}
        </Button>
        <Button variant="outline" size="sm" disabled={pending} onClick={handleExport}>
          <FileDown className="mr-1.5 size-4" />
          {fr.planning.exportPdf}
        </Button>
      </div>
    </div>
  );
}
