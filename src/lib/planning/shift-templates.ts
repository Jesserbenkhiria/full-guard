import type { DayOfWeek, ShiftType } from "@prisma/client";
import type { ShiftPlanningRow, ShiftTemplate } from "@/types/planning";
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

/** Adjacent bands (16:45–23:30 vs 08:00–16:45) do not overlap. */
export function timesOverlapExclusive(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Recurring slot hidden when a dated Excel override covers the same hours. */
export function isRequirementSupersededOnDate(
  req: Pick<ShiftTemplate, "specificDate" | "startTime" | "endTime">,
  dateKey: string,
  siblings: Pick<ShiftTemplate, "specificDate" | "startTime" | "endTime">[]
): boolean {
  if (req.specificDate) return false;
  return siblings.some(
    (other) =>
      other.specificDate === dateKey &&
      timesOverlapExclusive(req.startTime, req.endTime, other.startTime, other.endTime)
  );
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

/** One calendar row per hours band — dated copies of the same créneau share a line. */
export function mergeShiftRowsByHours(rows: ShiftPlanningRow[]): ShiftPlanningRow[] {
  const groups = new Map<string, ShiftPlanningRow[]>();
  for (const row of rows) {
    const key = `${row.shiftType}:${row.role}:${row.startTime}-${row.endTime}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const merged: ShiftPlanningRow[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    const slotsByDate: ShiftPlanningRow["slotsByDate"] = {};
    let agentCount = 0;
    for (const row of group) {
      agentCount = Math.max(agentCount, row.agentCount);
      for (const [date, slots] of Object.entries(row.slotsByDate)) {
        slotsByDate[date] = [...(slotsByDate[date] ?? []), ...slots];
      }
    }

    const generic =
      group.find((r) => !/\d{2}\/\d{2}/.test(r.label)) ?? group[0];

    merged.push({
      ...generic,
      requirementId: group.map((r) => r.requirementId).join("+"),
      label: formatShiftLabel(generic.startTime, generic.endTime),
      agentCount,
      slotsByDate,
    });
  }

  return merged;
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

  return (
    assignment.siteId === slot.siteId &&
    assignment.date === slot.date &&
    assignment.startTime === slot.startTime &&
    assignment.endTime === slot.endTime
  );
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
