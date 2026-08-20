import type { ShiftType } from "@prisma/client";

type ShiftLike = {
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
};

export function isOvernightShift(startTime: string, endTime: string): boolean {
  return endTime < startTime;
}

export function isNightShift(shift: ShiftLike): boolean {
  if (shift.shiftType === "NIGHT") return true;
  if (isOvernightShift(shift.startTime, shift.endTime)) return true;
  if (shift.startTime >= "18:00") return true;
  return shift.startTime === "19:00" && shift.endTime === "07:00";
}

export function isDayShift(shift: ShiftLike): boolean {
  if (shift.shiftType === "DAY") return true;
  if (isNightShift(shift)) return false;
  return shift.startTime <= "08:00" && shift.endTime >= "17:00";
}

/** Day 07–19 followed by night 19–07, or the reverse — forbidden transition. */
export function isForbiddenDayNightTransition(a: ShiftLike, b: ShiftLike): boolean {
  const aDay = isDayShift(a);
  const aNight = isNightShift(a);
  const bDay = isDayShift(b);
  const bNight = isNightShift(b);

  if ((aDay && bNight) || (aNight && bDay)) {
    if (a.endTime === b.startTime) return true;
    if (aNight && bDay && a.endTime === "07:00" && b.startTime === "07:00") return true;
    if (aDay && bNight && a.endTime === "19:00" && b.startTime === "19:00") return true;
  }
  return false;
}
