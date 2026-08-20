"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import type { PlanningAssignmentDto, PlanningSlotDto } from "@/types/planning";

type PlanningDndProviderProps = {
  children: React.ReactNode;
  onDrop?: (assignment: PlanningAssignmentDto, targetSlot: PlanningSlotDto) => void;
};

export function PlanningDndProvider({ children, onDrop }: PlanningDndProviderProps) {
  const [activeAssignment, setActiveAssignment] = useState<PlanningAssignmentDto | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const assignment = event.active.data.current?.assignment as PlanningAssignmentDto | undefined;
    if (assignment) setActiveAssignment(assignment);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveAssignment(null);
    const assignment = event.active.data.current?.assignment as PlanningAssignmentDto | undefined;
    const targetSlot = event.over?.data.current?.slot as PlanningSlotDto | undefined;
    if (assignment && targetSlot && onDrop) {
      onDrop(assignment, targetSlot);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {children}
      <DragOverlay>
        {activeAssignment ? (
          <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-lg">
            {activeAssignment.agentName}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
