import type { PositionRole, ShiftType } from "@prisma/client";

export type AssignmentWriteInput = {
  planningMonthId: string;
  agentId: string;
  siteId: string;
  requirementId?: string | null;
  date: Date;
  shiftType: ShiftType;
  role?: PositionRole;
  startTime: string;
  endTime: string;
  hours: number;
  notes?: string | null;
  aiGenerated?: boolean;
  aiConfidence?: number | null;
  aiExplanation?: string | null;
};

export function buildAssignmentWriteData(input: AssignmentWriteInput) {
  return {
    planningMonthId: input.planningMonthId,
    agentId: input.agentId,
    siteId: input.siteId,
    requirementId: input.requirementId ?? null,
    date: input.date,
    shiftType: input.shiftType,
    role: input.role ?? "AGENT",
    startTime: input.startTime,
    endTime: input.endTime,
    hours: input.hours,
    notes: input.notes ?? null,
    aiGenerated: input.aiGenerated ?? false,
    aiConfidence: input.aiConfidence ?? null,
    aiExplanation: input.aiExplanation ?? null,
  };
}
