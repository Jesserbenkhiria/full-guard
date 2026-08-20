export function shiftDateTimeRange(
  date: Date,
  startTime: string,
  endTime: string
): { start: Date; end: Date } {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const start = new Date(date);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(date);
  end.setHours(eh, em, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

export function hoursBetweenShifts(
  earlier: { date: Date; startTime: string; endTime: string },
  later: { date: Date; startTime: string; endTime: string }
): number {
  const a = shiftDateTimeRange(earlier.date, earlier.startTime, earlier.endTime);
  const b = shiftDateTimeRange(later.date, later.startTime, later.endTime);
  const first = a.start <= b.start ? a : b;
  const second = a.start <= b.start ? b : a;
  return (second.start.getTime() - first.end.getTime()) / 3_600_000;
}

export function calculateShiftHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60;
  return Math.round(((endMin - startMin) / 60) * 10) / 10;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getShiftRange(startTime: string, endTime: string): [number, number] {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end <= start) end += 24 * 60;
  return [start, end];
}

export function shiftsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const [as, ae] = getShiftRange(aStart, aEnd);
  const [bs, be] = getShiftRange(bStart, bEnd);
  return as < be && bs < ae;
}

export function sumAssignmentHours(
  assignments: { hours: number | null; startTime: string; endTime: string }[]
): number {
  return Math.round(
    assignments.reduce(
      (sum, a) => sum + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)),
      0
    ) * 10
  ) / 10;
}

export function getRemainingContractHours(
  contractHours: number | null | undefined,
  workedHours: number
): number | null {
  if (contractHours == null) return null;
  return Math.max(0, Math.round((contractHours - workedHours) * 10) / 10);
}
