import {
  isWeekendDateKey,
  parseDateKey,
  toDateKey,
} from "@/lib/planning/dates";

/** Saturday date key identifying a Sat–Sun weekend period. */
export function weekendPeriodKey(date: Date): string {
  const key = toDateKey(date);
  const parsed = parseDateKey(key);
  const jsDay = parsed.getDay();
  if (jsDay === 6) return key;
  if (jsDay === 0) {
    parsed.setDate(parsed.getDate() - 1);
    return toDateKey(parsed);
  }
  return key;
}

export function isWeekendDay(date: Date): boolean {
  return isWeekendDateKey(toDateKey(date));
}

/**
 * Count distinct weekend periods worked up to and including `upToDate`.
 * Only looks at assignments on or before that date — future weekends in the month are ignored.
 */
export function countWeekendWeeksWorked(
  assignments: { date: Date }[],
  upToDate: Date
): number {
  const upToKey = toDateKey(upToDate);
  const weeks = new Set<string>();

  for (const assignment of assignments) {
    const dateKey = toDateKey(assignment.date);
    if (dateKey > upToKey) continue;
    if (!isWeekendDateKey(dateKey)) continue;
    weeks.add(weekendPeriodKey(assignment.date));
  }

  return weeks.size;
}

export function weekendWeeksWorkedBefore(
  assignments: { date: Date }[],
  slotDate: Date
): number {
  const slotKey = toDateKey(slotDate);
  const weeks = new Set<string>();

  for (const assignment of assignments) {
    const dateKey = toDateKey(assignment.date);
    if (dateKey >= slotKey) continue;
    if (!isWeekendDateKey(dateKey)) continue;
    weeks.add(weekendPeriodKey(assignment.date));
  }

  return weeks.size;
}