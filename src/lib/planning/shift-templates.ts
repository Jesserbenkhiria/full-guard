import type { DayOfWeek, ShiftType } from "@prisma/client";
import type { ShiftTemplate } from "@/types/planning";
import { getDayOfWeek, getMonthDays, isSameCalendarDay, toDateKey } from "./dates";

type RequirementLike = {
  id: string;
  siteId: string;
  label: string | null;
  days: DayOfWeek[];
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  agentCount: number;
  specificDate: Date | null;
};

export function toShiftTemplate(req: RequirementLike): ShiftTemplate {
  return {
    id: req.id,
    siteId: req.siteId,
    label: req.label,
    days: req.days,
    shiftType: req.shiftType,
    startTime: req.startTime,
    endTime: req.endTime,
    agentCount: req.agentCount,
    specificDate: req.specificDate ? toDateKey(req.specificDate) : null,
  };
}

export function requirementAppliesOnDate(req: ShiftTemplate, date: Date): boolean {
  if (req.specificDate) {
    return req.specificDate === toDateKey(date);
  }
  return req.days.includes(getDayOfWeek(date));
}

export function getApplicableDates(
  req: ShiftTemplate,
  year: number,
  month: number
): string[] {
  return getMonthDays(year, month)
    .filter((date) => requirementAppliesOnDate(req, date))
    .map(toDateKey);
}

export function shiftBandKey(startTime: string, endTime: string, shiftType: string): string {
  return `${shiftType}:${startTime}-${endTime}`;
}

export function assignmentsMatchSlot(
  assignment: {
    siteId: string;
    date: string;
    startTime: string;
    endTime: string;
    requirementId?: string | null;
    role?: string;
  },
  slot: {
    siteId: string;
    date: string;
    startTime: string;
    endTime: string;
    requirementId?: string;
    role?: string;
  }
): boolean {
  if (slot.requirementId && assignment.requirementId) {
    return (
      assignment.requirementId === slot.requirementId &&
      assignment.date === slot.date
    );
  }

  const timeMatch =
    assignment.siteId === slot.siteId &&
    assignment.date === slot.date &&
    assignment.startTime === slot.startTime &&
    assignment.endTime === slot.endTime;

  if (!timeMatch) return false;

  if (slot.role && assignment.role) {
    return assignment.role === slot.role;
  }

  return true;
}

export function formatShiftLabel(startTime: string, endTime: string): string {
  return `${startTime}–${endTime}`;
}

/** Check if a date falls within a specific-date requirement's month. */
export function isSpecificDateInMonth(
  specificDate: Date | null,
  year: number,
  month: number
): boolean {
  if (!specificDate) return true;
  const d = new Date(year, month - 1, 1);
  return (
    specificDate.getFullYear() === d.getFullYear() &&
    specificDate.getMonth() === d.getMonth()
  );
}

export function isSameSpecificDate(a: Date | null, b: Date): boolean {
  if (!a) return false;
  return isSameCalendarDay(a, b);
}
