/**
 * Site shift requirements — source: Mr. Lajimi (Aug 2026).
 * Shared by seed.ts and migrate-lajimi-spec.ts
 */
import { DayOfWeek, ShiftType, PositionRole } from "@prisma/client";

export const WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

export const TUE_FRI: DayOfWeek[] = WEEKDAYS.filter((d) => d !== DayOfWeek.MONDAY);
export const MON_THU: DayOfWeek[] = [...WEEKDAYS.slice(0, 4)];
export const MON_SAT: DayOfWeek[] = [...WEEKDAYS, DayOfWeek.SATURDAY];
export const ALL_DAYS: DayOfWeek[] = [...MON_SAT, DayOfWeek.SUNDAY];

type RequirementSeed = {
  label: string;
  days: DayOfWeek[];
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  role?: PositionRole;
  agentCount: number;
  priority: number;
  /** ISO date YYYY-MM-DD — one-off override (e.g. LE DOUZE 24/09 08:00). */
  specificDate?: string;
};

export function toRequirementCreateData(req: RequirementSeed) {
  return {
    label: req.label,
    days: req.days,
    shiftType: req.shiftType,
    startTime: req.startTime,
    endTime: req.endTime,
    role: req.role ?? PositionRole.AGENT,
    agentCount: req.agentCount,
    priority: req.priority,
    active: true,
    ...(req.specificDate
      ? { specificDate: new Date(`${req.specificDate}T12:00:00.000Z`) }
      : {}),
  };
}

export const GEMEAUX_REQUIREMENTS: RequirementSeed[] = [
  {
    label: "Chef de poste SSIAP 2 jour lun-jeu",
    days: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY],
    shiftType: ShiftType.DAY,
    startTime: "07:00",
    endTime: "19:00",
    role: PositionRole.TEAM_LEADER,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Chef de poste SSIAP 2 jour vendredi",
    days: [DayOfWeek.FRIDAY],
    shiftType: ShiftType.DAY,
    startTime: "07:00",
    endTime: "19:00",
    role: PositionRole.TEAM_LEADER,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Agents SSIAP 1 jour lun-ven (×2)",
    days: WEEKDAYS,
    shiftType: ShiftType.DAY,
    startTime: "07:00",
    endTime: "19:00",
    role: PositionRole.AGENT,
    agentCount: 2,
    priority: 1,
  },
  {
    label: "Agent nuit lun-ven",
    days: WEEKDAYS,
    shiftType: ShiftType.NIGHT,
    startTime: "19:00",
    endTime: "07:00",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Chef de poste jour samedi",
    days: [DayOfWeek.SATURDAY],
    shiftType: ShiftType.DAY,
    startTime: "07:00",
    endTime: "19:00",
    role: PositionRole.TEAM_LEADER,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Agent SSIAP 1 jour samedi 07h-19h",
    days: [DayOfWeek.SATURDAY],
    shiftType: ShiftType.DAY,
    startTime: "07:00",
    endTime: "19:00",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Agent jour samedi 08h-17h45",
    days: [DayOfWeek.SATURDAY],
    shiftType: ShiftType.DAY,
    startTime: "08:00",
    endTime: "17:45",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Agent nuit samedi",
    days: [DayOfWeek.SATURDAY],
    shiftType: ShiftType.NIGHT,
    startTime: "19:00",
    endTime: "07:00",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Agent jour dimanche",
    days: [DayOfWeek.SUNDAY],
    shiftType: ShiftType.DAY,
    startTime: "07:00",
    endTime: "19:00",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Agent nuit dimanche",
    days: [DayOfWeek.SUNDAY],
    shiftType: ShiftType.NIGHT,
    startTime: "19:00",
    endTime: "07:00",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
];

export const LE_DOUZE_DJONKA_FULL_DAYS_SEP_2026: {
  date: string;
  startTime: string;
  endTime: string;
}[] = [{ date: "2026-09-30", startTime: "08:45", endTime: "23:30" }];

export function leDouzeFullDayOn(dateKey: string) {
  return LE_DOUZE_DJONKA_FULL_DAYS_SEP_2026.find((d) => d.date === dateKey) ?? null;
}

export function leDouzeExcelTimes(
  dateKey: string,
  startTime: string,
  endTime: string,
  day: DayOfWeek
): { startTime: string; endTime: string } {
  const full = leDouzeFullDayOn(dateKey);
  if (full) return { startTime: full.startTime, endTime: full.endTime };
  if (day === DayOfWeek.SATURDAY) {
    return { startTime: "08:45", endTime: "19:30" };
  }
  const evening =
    startTime === "16:45" || endTime === "23:00" || endTime === "23:30";
  if (evening) {
    if (day === DayOfWeek.MONDAY) {
      return { startTime: "16:45", endTime: "23:00" };
    }
    return { startTime: "16:45", endTime: "23:30" };
  }
  if (dateKey === "2026-09-24") {
    return { startTime: "08:00", endTime: "16:45" };
  }
  return { startTime: "08:45", endTime: "16:45" };
}

export const LE_DOUZE_REQUIREMENTS: RequirementSeed[] = [
  {
    label: "Site LE DOUZE — jour lun-ven 08h45-16h45",
    days: WEEKDAYS,
    shiftType: ShiftType.CUSTOM,
    startTime: "08:45",
    endTime: "16:45",
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Site LE DOUZE — jeudi 24/09 08h00-16h45 (Excel SSIAP)",
    days: [],
    shiftType: ShiftType.CUSTOM,
    startTime: "08:00",
    endTime: "16:45",
    agentCount: 1,
    priority: 1,
    specificDate: "2026-09-24",
  },
  {
    label: "Site LE DOUZE — soir lun 16h45-23h00 (Djonka)",
    days: [DayOfWeek.MONDAY],
    shiftType: ShiftType.CUSTOM,
    startTime: "16:45",
    endTime: "23:00",
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Site LE DOUZE — soir mar-ven 16h45-23h30 (Djonka)",
    days: TUE_FRI,
    shiftType: ShiftType.CUSTOM,
    startTime: "16:45",
    endTime: "23:30",
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Site LE DOUZE — samedi 08h45-19h30 (1 agent : Kaid ou Djonka)",
    days: [DayOfWeek.SATURDAY],
    shiftType: ShiftType.CUSTOM,
    startTime: "08:45",
    endTime: "19:30",
    agentCount: 1,
    priority: 1,
  },
  ...LE_DOUZE_DJONKA_FULL_DAYS_SEP_2026.map((d) => ({
    label: `Site LE DOUZE — ${d.date.slice(8, 10)}/${d.date.slice(5, 7)} 08h45-23h30 (Djonka journée)`,
    days: [] as DayOfWeek[],
    shiftType: ShiftType.CUSTOM,
    startTime: d.startTime,
    endTime: d.endTime,
    agentCount: 1,
    priority: 1,
    specificDate: d.date,
  })),
];

export const PLEYEL_REQUIREMENTS: RequirementSeed[] = [
  {
    label: "Nuit lun-jeu",
    days: MON_THU,
    shiftType: ShiftType.NIGHT,
    startTime: "18:30",
    endTime: "08:30",
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Nuit vendredi",
    days: [DayOfWeek.FRIDAY],
    shiftType: ShiftType.NIGHT,
    startTime: "18:30",
    endTime: "08:00",
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Jour samedi",
    days: [DayOfWeek.SATURDAY],
    shiftType: ShiftType.DAY,
    startTime: "08:00",
    endTime: "20:00",
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Nuit samedi (20h-08h)",
    days: [DayOfWeek.SATURDAY],
    shiftType: ShiftType.NIGHT,
    startTime: "20:00",
    endTime: "08:00",
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Jour dimanche",
    days: [DayOfWeek.SUNDAY],
    shiftType: ShiftType.DAY,
    startTime: "08:00",
    endTime: "20:00",
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Nuit dimanche (20h-08h30)",
    days: [DayOfWeek.SUNDAY],
    shiftType: ShiftType.NIGHT,
    startTime: "20:00",
    endTime: "08:30",
    agentCount: 1,
    priority: 1,
  },
];

/** Client file FILES AOUT/Sept 2026.xlsx — horaires SSIAP bâtiment, 1 agent. */
export const VISAGE_SEPTEMBER_2026_SHIFTS: { date: string; start: string; end: string }[] = [
  { date: "2026-09-13", start: "09:30", end: "17:30" },
  { date: "2026-09-14", start: "18:00", end: "22:30" },
  { date: "2026-09-15", start: "17:00", end: "22:30" },
  { date: "2026-09-16", start: "18:00", end: "22:30" },
  { date: "2026-09-17", start: "18:00", end: "22:30" },
  { date: "2026-09-18", start: "18:00", end: "22:30" },
  { date: "2026-09-20", start: "12:30", end: "18:30" },
  { date: "2026-09-21", start: "18:00", end: "22:00" },
  { date: "2026-09-22", start: "17:00", end: "22:30" },
  { date: "2026-09-23", start: "18:00", end: "22:30" },
  { date: "2026-09-24", start: "18:00", end: "22:30" },
  { date: "2026-09-27", start: "12:30", end: "18:30" },
  { date: "2026-09-28", start: "18:00", end: "23:00" },
  { date: "2026-09-29", start: "17:00", end: "23:00" },
  { date: "2026-09-30", start: "18:00", end: "23:00" },
];
