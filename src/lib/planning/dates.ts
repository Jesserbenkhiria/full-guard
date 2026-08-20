import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  startOfMonth,
} from "date-fns";
import { fr as dateFnsFr } from "date-fns/locale";
import type { DayOfWeek } from "@prisma/client";

const JS_DAY_TO_ENUM: DayOfWeek[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function getDayOfWeek(date: Date): DayOfWeek {
  return JS_DAY_TO_ENUM[getDay(parseDateKey(toDateKey(date)))];
}

export function getMonthDays(year: number, month: number): Date[] {
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  return eachDayOfInterval({ start, end });
}

export function formatMonthLabel(year: number, month: number): string {
  return format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: dateFnsFr });
}

export function formatShortDate(date: Date): string {
  return format(date, "dd/MM/yyyy", { locale: dateFnsFr });
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const key = toDateKey(date);
  return key >= toDateKey(start) && key <= toDateKey(end);
}

export function formatShortWeekday(dateKey: string): string {
  return format(parseDateKey(dateKey), "EEE", { locale: dateFnsFr });
}

export function formatDayOfMonth(dateKey: string): string {
  return format(parseDateKey(dateKey), "dd");
}

export function isWeekendDateKey(dateKey: string): boolean {
  const dow = getDay(parseDateKey(dateKey));
  return dow === 0 || dow === 6;
}
