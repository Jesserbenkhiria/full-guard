"use client";

import { cn } from "@/lib/utils";
import { formatShiftLabel } from "@/lib/planning/shift-templates";
import type { PlanningAssignmentDto, PlanningSlotDto } from "@/types/planning";
import { fr } from "@/lib/i18n/fr";
import { getSiteColorStyle } from "@/lib/site-colors";
import { POSITION_ROLE_LABELS } from "@/lib/constants";
import { CheckCircle2, AlertTriangle, XCircle, Circle } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { useClientMounted } from "@/hooks/use-client-mounted";

type AssignmentCellProps = {
  slot: PlanningSlotDto;
  onClick: () => void;
  draggable?: boolean;
  compact?: boolean;
};

function StatusIcon({ status }: { status: "valid" | "warning" | "error" | "empty" }) {
  if (status === "valid") return <CheckCircle2 className="size-3 text-emerald-600" />;
  if (status === "warning") return <AlertTriangle className="size-3 text-amber-500" />;
  if (status === "error") return <XCircle className="size-3 text-red-500" />;
  return null;
}

function getCellStatus(assignment: PlanningAssignmentDto | null): "valid" | "warning" | "error" | "empty" {
  if (!assignment) return "empty";
  return assignment.validationStatus;
}

function getPrimaryAlert(assignment: PlanningAssignmentDto): string | null {
  const error = assignment.alerts.find((a) => a.severity === "ERROR");
  if (error) return error.message;
  const warning = assignment.alerts.find((a) => a.severity === "WARNING");
  return warning?.message ?? null;
}

export function AssignmentCell({ slot, onClick, draggable = true, compact = false }: AssignmentCellProps) {
  const mounted = useClientMounted();
  const assignment = slot.assignment;
  const status = getCellStatus(assignment);
  const alertMessage = assignment ? getPrimaryAlert(assignment) : null;
  const siteStyle = assignment?.siteName ? getSiteColorStyle(assignment.siteName) : null;
  const canDrag = mounted && draggable && Boolean(assignment);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: slot.id,
    data: { slot, assignment },
    disabled: !canDrag,
  });

  return (
    <button
      type="button"
      ref={canDrag ? setNodeRef : undefined}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col items-start gap-0.5 rounded-md border p-1.5 text-left text-xs transition-colors",
        compact ? "min-h-[52px]" : "min-h-[80px]",
        status === "empty" &&
          slot.role === "TEAM_LEADER" &&
          "border-dashed border-amber-400/70 bg-amber-50/50 hover:bg-amber-50/80 dark:border-amber-700 dark:bg-amber-950/30",
        status === "empty" &&
          slot.role !== "TEAM_LEADER" &&
          "border-dashed border-amber-300/60 bg-amber-50/30 hover:bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20",
        status === "valid" && siteStyle && `${siteStyle.cellHeatClass}`,
        status === "valid" && !siteStyle && "border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50",
        status === "warning" && "border-amber-200 bg-amber-50/60 hover:bg-amber-50",
        status === "error" && "border-red-200 bg-red-50/60 hover:bg-red-50",
        isDragging && "opacity-40"
      )}
    >
      {assignment ? (
        <>
          <span className="font-semibold leading-tight">{assignment.agentName}</span>
          {!compact && (
            <span className="text-muted-foreground">
              {formatShiftLabel(assignment.startTime, assignment.endTime)}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px]">
            <StatusIcon status={status} />
            {alertMessage ?? (
              <>
                {status === "valid" && fr.planning.validated}
                {status === "warning" && fr.planning.warning}
                {status === "error" && fr.planning.error}
              </>
            )}
          </span>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1 font-medium text-amber-800 dark:text-amber-200">
            <Circle className="size-2.5 fill-current" />
            {compact ? `#${slot.slotIndex + 1}` : fr.planning.unassignedSlot}
          </span>
          {!compact && slot.role === "TEAM_LEADER" && (
            <span className="rounded bg-amber-600/15 px-1 py-0.5 text-[9px] font-medium text-amber-800 dark:text-amber-200">
              {POSITION_ROLE_LABELS.TEAM_LEADER}
            </span>
          )}
          {!compact && (
            <span className="text-[10px] text-muted-foreground">
              {formatShiftLabel(slot.startTime, slot.endTime)}
            </span>
          )}
          <span className="text-[10px] font-medium text-primary opacity-80 group-hover:opacity-100">
            {compact ? "+" : fr.planning.chooseAgent}
          </span>
        </>
      )}
    </button>
  );
}

export function AgentDayCell({
  label,
  status,
  siteName,
  alertMessage,
  onClick,
}: {
  label: string;
  status: "valid" | "warning" | "error" | "off";
  siteName: string | null;
  alertMessage?: string | null;
  onClick?: () => void;
}) {
  const siteStyle = siteName ? getSiteColorStyle(siteName) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === "off" || !onClick}
      className={cn(
        "flex min-h-[52px] flex-col items-center justify-center rounded-md border px-1 py-1 text-[10px]",
        status === "off" && "border-transparent bg-muted/20 text-muted-foreground",
        status === "valid" && siteStyle && siteStyle.cellHeatClass,
        status === "valid" && !siteStyle && "border-emerald-200 bg-emerald-50/60",
        status === "warning" && "border-amber-300 bg-amber-50/80",
        status === "error" && "border-red-300 bg-red-50/80",
        onClick && status !== "off" && "cursor-pointer hover:opacity-80"
      )}
    >
      {siteStyle && status !== "off" && (
        <span className={cn("mb-0.5 size-2 rounded-full", siteStyle.dotClass)} />
      )}
      <span className="font-medium">{label}</span>
      {siteName && (
        <span className="max-w-full truncate text-[9px] text-muted-foreground">{siteName}</span>
      )}
      {alertMessage && (
        <span className="max-w-full truncate text-[8px] text-red-600">{alertMessage}</span>
      )}
    </button>
  );
}
