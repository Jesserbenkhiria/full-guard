"use client";

import { useDroppable } from "@dnd-kit/core";
import { AssignmentCell } from "@/components/planning/assignment-cell";
import { useClientMounted } from "@/hooks/use-client-mounted";
import { formatAgentsRequired } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PlanningSlotDto } from "@/types/planning";

function DroppableSlot({
  slot,
  onClick,
  compact,
}: {
  slot: PlanningSlotDto;
  onClick: () => void;
  compact?: boolean;
}) {
  const mounted = useClientMounted();
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${slot.id}`,
    data: { slot },
    disabled: !mounted,
  });

  return (
    <div
      ref={mounted ? setNodeRef : undefined}
      className={isOver ? "rounded-md ring-2 ring-primary/40" : undefined}
    >
      <AssignmentCell slot={slot} onClick={onClick} compact={compact} />
    </div>
  );
}

type DayShiftCellProps = {
  slots: PlanningSlotDto[];
  onSlotClick: (slot: PlanningSlotDto) => void;
  isTeamLeader?: boolean;
};

export function DayShiftCell({ slots, onSlotClick, isTeamLeader }: DayShiftCellProps) {
  if (slots.length === 0) {
    return <div className="min-h-[32px] bg-muted/10" />;
  }

  const required = slots[0]?.requiredAgents ?? slots.length;
  const filled = slots.filter((s) => s.assignment).length;
  const allFilled = filled >= required;

  return (
    <div
      className={cn(
        "flex min-w-[96px] flex-col overflow-hidden rounded-md border bg-background",
        isTeamLeader && "border-amber-300/50",
        !allFilled && "border-amber-200/80"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-1 border-b px-1.5 py-1",
          isTeamLeader ? "bg-amber-50/80 dark:bg-amber-950/30" : "bg-muted/40"
        )}
      >
        <span className="text-[10px] font-semibold leading-none text-foreground">
          {formatAgentsRequired(required)}
        </span>
        <span
          className={cn(
            "text-[9px] font-medium leading-none",
            allFilled ? "text-emerald-600" : "text-amber-700 dark:text-amber-400"
          )}
        >
          {filled}/{required}
        </span>
      </div>

      <div className="flex flex-col gap-1 p-1">
        {slots.map((slot) => (
          <DroppableSlot
            key={slot.id}
            slot={slot}
            compact
            onClick={() => onSlotClick(slot)}
          />
        ))}
      </div>
    </div>
  );
}
