import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { fr } from "@/lib/i18n/fr";

export default function SettingsPage() {
  return (
    <DashboardShell title={fr.settings.title} description={fr.settings.description}>
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{fr.settings.application}</CardTitle>
            <CardDescription>{fr.settings.general}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{fr.settings.appName}</span>
              <span>{process.env.NEXT_PUBLIC_APP_NAME ?? fr.app.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{fr.settings.environment}</span>
              <Badge variant="outline">{process.env.NODE_ENV}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{fr.settings.authentication}</CardTitle>
            <CardDescription>{fr.settings.authDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{fr.settings.authEnabled}</span>
              <Badge variant={process.env.AUTH_ENABLED === "true" ? "default" : "secondary"}>
                {process.env.AUTH_ENABLED === "true" ? fr.common.yes : fr.common.no}
              </Badge>
            </div>
            <Separator />
            <p className="text-muted-foreground">{fr.settings.authHint}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{fr.settings.importExport}</CardTitle>
            <CardDescription>{fr.settings.importExportDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{fr.settings.importPhase}</p>
            <p>{fr.settings.exportPhase}</p>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
