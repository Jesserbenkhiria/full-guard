"use client";

import { useMemo, useState } from "react";
import { Plus, CheckCircle2, AlertTriangle, Palmtree } from "lucide-react";
import type { AgentListItem } from "@/lib/agent-operational";
import { computeAgentReadiness } from "@/lib/agent-operational";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentFormDialog } from "@/components/agents/agent-form-dialog";
import { AgentsTable } from "@/components/agents/agents-table";
import { fr } from "@/lib/i18n/fr";

type SiteOption = { id: string; name: string };

type AgentsPageClientProps = {
  agents: AgentListItem[];
  sites: SiteOption[];
};

export function AgentsPageClient({ agents, sites }: AgentsPageClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const readiness = useMemo(() => computeAgentReadiness(agents), [agents]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-2xl font-semibold tracking-tight">
            {readiness.total}{" "}
            <span className="text-base font-normal text-muted-foreground">
              {fr.agents.agentsCountLabel}
            </span>
          </p>

          <div className="flex flex-wrap gap-2">
            <ReadinessChip
              icon={<CheckCircle2 className="size-3.5 text-emerald-600" />}
              label={`${readiness.configured} ${fr.agents.readinessConfigured}`}
              className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            />
            {readiness.restrictionsToVerify > 0 && (
              <ReadinessChip
                icon={<AlertTriangle className="size-3.5 text-amber-600" />}
                label={`${readiness.restrictionsToVerify} ${fr.agents.readinessRestrictions}`}
                className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
              />
            )}
            {readiness.onVacation > 0 && (
              <ReadinessChip
                icon={<Palmtree className="size-3.5 text-orange-600" />}
                label={`${readiness.onVacation} ${fr.agents.readinessOnVacation}`}
                className="border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200"
              />
            )}
          </div>
        </div>

        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="mr-2 size-4" />
          {fr.agents.addAgent}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{fr.agents.directory}</CardTitle>
          <CardDescription>{fr.agents.directoryDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentsTable agents={agents} sites={sites} />
        </CardContent>
      </Card>

      <AgentFormDialog open={createOpen} onOpenChange={setCreateOpen} sites={sites} />
    </div>
  );
}

function ReadinessChip({
  icon,
  label,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}
