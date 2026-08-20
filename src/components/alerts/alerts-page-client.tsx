"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteLabel } from "@/components/shared/site-label";
import { formatMonthLabel } from "@/lib/planning/dates";
import { formatAgentName } from "@/lib/constants";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { fr } from "@/lib/i18n/fr";
import { cn } from "@/lib/utils";

type AlertRow = {
  id: string;
  ruleCode: string;
  severity: string;
  message: string;
  resolved: boolean;
  agent: { lastName: string; firstName: string } | null;
  site: { name: string } | null;
  assignment: { id: string } | null;
};

type AlertsPageClientProps = {
  alerts: AlertRow[];
  year: number;
  month: number;
  title: string;
  description: string;
};

export function AlertsPageClient({
  alerts,
  year,
  month,
  title,
  description,
}: AlertsPageClientProps) {
  const router = useRouter();
  const errors = alerts.filter((a) => a.severity === "ERROR");
  const warnings = alerts.filter((a) => a.severity === "WARNING");

  function navigateMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    router.push(
      `/alerts?year=${date.getFullYear()}&month=${date.getMonth() + 1}`
    );
  }

  return (
    <DashboardShell
      title={title}
      description={description}
      alertCount={errors.length + warnings.length}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium capitalize">
            {formatMonthLabel(year, month)}
          </span>
          <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/planning?year=${year}&month=${month}`} />}
        >
          {fr.alerts.openPlanning}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive">{fr.alerts.blocking}</CardTitle>
            <CardDescription>{fr.alerts.blockingDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">{errors.length}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-600">{fr.alerts.warnings}</CardTitle>
            <CardDescription>{fr.alerts.warningsDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{warnings.length}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-600/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-emerald-700">{fr.alerts.resolvedCount}</CardTitle>
            <CardDescription>{fr.alerts.resolvedCountDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-700">
              {errors.length + warnings.length === 0 ? "✓" : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{fr.alerts.allAlerts}</CardTitle>
          <CardDescription>{fr.alerts.allAlertsDescActive}</CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">{fr.alerts.noAlerts}</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3",
                    alert.severity === "ERROR" && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20",
                    alert.severity === "WARNING" && "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
                  )}
                >
                  <SeverityIcon severity={alert.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{alert.message}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {alert.ruleCode}
                      </Badge>
                      {alert.site && <SiteLabel name={alert.site.name} className="text-[10px]" />}
                      {alert.agent && (
                        <span className="text-xs text-muted-foreground">
                          {formatAgentName(alert.agent.firstName, alert.agent.lastName)}
                        </span>
                      )}
                    </div>
                  </div>
                  {alert.assignment && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs"
                      nativeButton={false}
                      render={<Link href={`/planning?year=${year}&month=${month}`} />}
                    >
                      {fr.alerts.fixInPlanning}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "ERROR") return <AlertTriangle className="size-4 shrink-0 text-destructive" />;
  if (severity === "WARNING") return <Info className="size-4 shrink-0 text-amber-500" />;
  return <CheckCircle2 className="size-4 shrink-0 text-green-600" />;
}
