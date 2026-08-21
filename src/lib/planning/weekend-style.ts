import { getWeekendKind } from "@/lib/planning/dates";

/** Screen calendar: Saturday = sky, Sunday = violet. */
export function weekendHeaderClass(dateKey: string): string {
  const kind = getWeekendKind(dateKey);
  if (kind === "saturday") {
    return "bg-sky-200/90 text-sky-950 dark:bg-sky-900 dark:text-sky-100";
  }
  if (kind === "sunday") {
    return "bg-violet-200/90 text-violet-950 dark:bg-violet-900 dark:text-violet-100";
  }
  return "";
}

export function weekendCellClass(dateKey: string): string {
  const kind = getWeekendKind(dateKey);
  if (kind === "saturday") {
    return "bg-sky-50 dark:bg-sky-950/50";
  }
  if (kind === "sunday") {
    return "bg-violet-50 dark:bg-violet-950/50";
  }
  return "";
}

export function weekendHeaderLabelClass(dateKey: string): string {
  const kind = getWeekendKind(dateKey);
  if (kind === "saturday") return "text-sky-800 dark:text-sky-200";
  if (kind === "sunday") return "text-violet-800 dark:text-violet-200";
  return "text-muted-foreground";
}

/** Print CSS class on th/td. */
export function weekendPrintClass(dateKey: string): string | undefined {
  const kind = getWeekendKind(dateKey);
  if (kind === "saturday") return "print-weekend-sat";
  if (kind === "sunday") return "print-weekend-sun";
  return undefined;
}
