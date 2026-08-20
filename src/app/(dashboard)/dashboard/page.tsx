import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getDashboardStats, getRecentAlerts } from "@/services/dashboard/stats";
import {
  Users,
  Building2,
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { fr } from "@/lib/i18n/fr";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    DRAFT: "secondary",
    IN_REVIEW: "outline",
    VALIDATED: "default",
    EXPORTED: "default",
  };
  return variants[status] ?? "secondary";
}

function statusLabel(status: string) {
  return fr.status[status as keyof typeof fr.status] ?? status.replace("_", " ");
}

export default async function DashboardPage() {
  let stats: Awaited<ReturnType<typeof getDashboardStats>>;
  let alerts: Awaited<ReturnType<typeof getRecentAlerts>>;

  try {
    [stats, alerts] = await Promise.all([getDashboardStats(), getRecentAlerts()]);
  } catch {
    stats = {
      totalAgents: 0,
      totalSites: 0,
      activeAgents: 0,
      activeSites: 0,
      planningStatus: "DRAFT",
      errorCount: 0,
      warningCount: 0,
      missingAssignments: 0,
    };
    alerts = [];
  }

  const monthName = new Date().toLocaleString("fr-FR", { month: "long", year: "numeric" });
  const totalAlerts = stats.errorCount + stats.warningCount;

  return (
    <DashboardShell
      title={fr.dashboard.title}
      description={`${fr.dashboard.overview} — ${monthName}`}
      alertCount={totalAlerts}
    >
      <div className="space-y-6">
        {!stats.totalAgents && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>{fr.dashboard.dbNotSeeded}</AlertTitle>
            <AlertDescription>
              {fr.dashboard.dbNotSeededDesc}{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                npm run db:push && npm run db:seed
              </code>{" "}
              pour charger les données d&apos;exemple.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{fr.dashboard.totalAgents}</CardTitle>
              <Users className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAgents}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeAgents} {fr.common.active.toLowerCase()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{fr.dashboard.totalSites}</CardTitle>
              <Building2 className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSites}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeSites} {fr.common.active.toLowerCase()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{fr.dashboard.planningStatus}</CardTitle>
              <CalendarCheck className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Badge variant={statusBadge(stats.planningStatus)} className="mb-1">
                {statusLabel(stats.planningStatus)}
              </Badge>
              <p className="text-xs text-muted-foreground">{monthName}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{fr.dashboard.missingAssignments}</CardTitle>
              <Clock className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.missingAssignments}</div>
              <p className="text-xs text-muted-foreground">{fr.dashboard.estimatedSlots}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{fr.dashboard.alertsSummary}</CardTitle>
              <CardDescription>{fr.dashboard.alertsDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-destructive" />
                  <span className="text-sm">{fr.dashboard.blockingErrors}</span>
                </div>
                <Badge variant="destructive">{stats.errorCount}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-amber-500" />
                  <span className="text-sm">{fr.dashboard.warnings}</span>
                </div>
                <Badge className="bg-amber-500 text-white">{stats.warningCount}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-green-600" />
                  <span className="text-sm">{fr.dashboard.readyForExport}</span>
                </div>
                <Badge variant="outline">
                  {stats.errorCount === 0 && stats.missingAssignments === 0
                    ? fr.common.yes
                    : fr.common.no}
                </Badge>
              </div>
              <Link
                href="/alerts"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {fr.dashboard.viewAllAlerts}
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{fr.dashboard.recentAlerts}</CardTitle>
              <CardDescription>{fr.dashboard.recentAlertsDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{fr.dashboard.noAlerts}</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((alert) => (
                    <li
                      key={alert.id}
                      className="flex items-start gap-2 rounded-lg border p-3 text-sm"
                    >
                      <AlertTriangle
                        className={`mt-0.5 size-4 shrink-0 ${
                          alert.severity === "ERROR"
                            ? "text-destructive"
                            : "text-amber-500"
                        }`}
                      />
                      <div>
                        <p>{alert.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {alert.agent
                            ? `${alert.agent.lastName}`
                            : alert.site?.name ?? fr.alerts.general}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
