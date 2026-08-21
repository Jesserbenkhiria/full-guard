import { DayOfWeek } from "@prisma/client";
import { getDayOfWeek, toDateKey } from "@/lib/planning/dates";

/** Encoded in AgentSiteRule.notes, e.g. sat:08:45-19:30 */
const SAT_NOTE = /sat:(\d{2}:\d{2})-(\d{2}:\d{2})/;
/** Monday-only hours, e.g. mon:16:45-23:00 (LE DOUZE Excel SSIAP). */
const MON_NOTE = /mon:(\d{2}:\d{2})-(\d{2}:\d{2})/;
/** One-off date hours, e.g. date:2026-09-24:08:00-16:45 */
const DATE_NOTE = /date:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})-(\d{2}:\d{2})/g;

export const LE_DOUZE_SATURDAY_SHIFT = {
  startTime: "08:45",
  endTime: "19:30",
} as const;

export function saturdayAlternateFromNotes(
  notes: string | null | undefined
): { startTime: string; endTime: string } | null {
  const m = notes?.match(SAT_NOTE);
  if (!m) return null;
  return { startTime: m[1], endTime: m[2] };
}

export function matchesSaturdayAlternate(
  notes: string | null | undefined,
  date: Date,
  startTime: string,
  endTime: string
): boolean {
  if (getDayOfWeek(date) !== DayOfWeek.SATURDAY) return false;
  const alt = saturdayAlternateFromNotes(notes);
  if (!alt) return false;
  return alt.startTime === startTime && alt.endTime === endTime;
}

/** Saturday, Monday, or dated Excel exceptions vs an agent's usual fixed hours. */
export function matchesTimeAlternate(
  notes: string | null | undefined,
  date: Date,
  startTime: string,
  endTime: string
): boolean {
  if (matchesSaturdayAlternate(notes, date, startTime, endTime)) return true;

  if (getDayOfWeek(date) === DayOfWeek.MONDAY) {
    const mon = notes?.match(MON_NOTE);
    if (mon && mon[1] === startTime && mon[2] === endTime) return true;
  }

  if (!notes) return false;
  const dateKey = toDateKey(date);
  const dateNote = new RegExp(DATE_NOTE.source, "g");
  for (const m of notes.matchAll(dateNote)) {
    if (m[1] === dateKey && m[2] === startTime && m[3] === endTime) return true;
  }
  return false;
}

export function hasDateOverrideOn(
  notes: string | null | undefined,
  date: Date
): boolean {
  if (!notes) return false;
  const dateKey = toDateKey(date);
  return notes.includes(`date:${dateKey}:`);
}

export function saturdayAlternateNote(startTime: string, endTime: string): string {
  return `sat:${startTime}-${endTime}`;
}
