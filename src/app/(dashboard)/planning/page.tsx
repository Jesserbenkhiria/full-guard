import { Suspense } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PlanningWorkspace } from "@/components/planning/planning-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMonthLabel } from "@/lib/planning/dates";
import { fr } from "@/lib/i18n/fr";
import {
  getDefaultPlanningPeriod,
  getPlanningData,
} from "@/services/planning/queries";

type PlanningPageProps = {
  searchParams: Promise<{ year?: string; month?: string; view?: string }>;
};

async function PlanningContent({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; view?: string };
}) {
  const defaults = await getDefaultPlanningPeriod();
  const year = Number(searchParams.year) || defaults.year;
  const month = Number(searchParams.month) || defaults.month;
  const view = searchParams.view === "agent" ? "agent" : "site";

  const data = await getPlanningData(year, month);

  return <PlanningWorkspace {...data} view={view} />;
}

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  const params = await searchParams;
  const defaults = await getDefaultPlanningPeriod();
  const year = Number(params.year) || defaults.year;
  const month = Number(params.month) || defaults.month;
  const monthName = formatMonthLabel(year, month);

  return (
    <DashboardShell
      title={fr.planning.title}
      description={`${fr.planning.schedule} — ${monthName}`}
    >
      <Suspense fallback={<PlanningSkeleton />}>
        <PlanningContent searchParams={params} />
      </Suspense>
    </DashboardShell>
  );
}

function PlanningSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full max-w-3xl" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}
