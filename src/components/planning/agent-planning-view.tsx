"use client";

import { AgentDayCell } from "@/components/planning/assignment-cell";
import { SHIFT_TYPE_LABELS } from "@/lib/constants";
import type { AgentPlanningRow } from "@/types/planning";
import { SiteLabel } from "@/components/shared/site-label";
import { fr } from "@/lib/i18n/fr";
import { AlertTriangle } from "lucide-react";

type AgentPlanningViewProps = {
  agents: AgentPlanningRow[];
  days: string[];
  onAssignmentClick: (assignmentId: string) => void;
};

function shiftLabel(shiftType: string | null): string {
  if (!shiftType || shiftType === "OFF") return fr.planning.off;
  return SHIFT_TYPE_LABELS[shiftType as keyof typeof SHIFT_TYPE_LABELS] ?? shiftType;
}

export function AgentPlanningView({
  agents,
  days,
  onAssignmentClick,
}: AgentPlanningViewProps) {
  if (agents.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">{fr.planning.noAgents}</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {Array.from(
          new Set(
            agents.flatMap((a) =>
              a.days.map((d) => d.siteName).filter(Boolean) as string[]
            )
          )
        ).map((siteName) => (
          <SiteLabel key={siteName} name={siteName} className="text-[10px]" />
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="sticky left-0 z-10 min-w-[140px] bg-muted/40 px-3 py-2 text-left font-medium">
              Agent
            </th>
            {days.map((day) => (
              <th key={day} className="min-w-[52px] px-1 py-2 text-center font-medium">
                {day.slice(8, 10)}
              </th>
            ))}
            <th className="min-w-[100px] px-2 py-2 text-right font-medium">{fr.planning.totalHours}</th>
            <th className="min-w-[90px] px-2 py-2 text-right font-medium">{fr.planning.remainingHours}</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.agentId} className="border-b last:border-0">
              <td className="sticky left-0 z-10 bg-background px-3 py-2">
                <div className="font-semibold">{agent.agentName}</div>
                {agent.contractHours && (
                  <div className="text-[10px] text-muted-foreground">
                    {fr.planning.contractHours}: {agent.contractHours}h
                  </div>
                )}
                {agent.overtimeHours > 0 && (
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600">
                    <AlertTriangle className="size-3" />
                    +{agent.overtimeHours}h {fr.planning.overtimeWarning}
                  </div>
                )}
              </td>
              {agent.days.map((cell) => (
                <td key={cell.date} className="p-1 align-top">
                  <AgentDayCell
                    label={shiftLabel(cell.shiftType)}
                    status={cell.validationStatus}
                    siteName={cell.siteName}
                    alertMessage={cell.alertMessage}
                    onClick={
                      cell.assignmentId
                        ? () => onAssignmentClick(cell.assignmentId!)
                        : undefined
                    }
                  />
                </td>
              ))}
              <td className="px-2 py-2 text-right font-medium">
                {agent.totalHours}h
                {agent.contractHours && (
                  <div className="text-[10px] text-muted-foreground">
                    / {agent.contractHours}h
                  </div>
                )}
              </td>
              <td className="px-2 py-2 text-right font-medium">
                {agent.remainingHours != null ? (
                  <>
                    <span
                      className={
                        agent.remainingHours <= 0
                          ? "text-red-600"
                          : agent.remainingHours <= 20
                            ? "text-amber-600"
                            : "text-emerald-700 dark:text-emerald-400"
                      }
                    >
                      {agent.remainingHours}h
                    </span>
                    {agent.contractHours && (
                      <div className="text-[10px] text-muted-foreground">
                        / {agent.contractHours}h
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
