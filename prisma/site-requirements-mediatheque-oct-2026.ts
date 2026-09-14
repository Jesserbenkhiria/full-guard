/**
 * Médiathèque de l'Horloge — octobre 2026 (spec client finale 14/09/2026).
 * 13 vacations / 96 heures.
 *
 * Période 1 (1–17 oct)  : mercredi + samedi uniquement  → 5 vac / 41 h
 * Période 2 (19–31 oct) : mar + mer + ven + sam (vacances scolaires) → 8 vac / 55 h
 */
import { ShiftType, PositionRole } from "@prisma/client";
import { toRequirementCreateData } from "./site-requirements-lajimi";

type MedShift = {
  date: string;
  startTime: string;
  endTime: string;
  label: string;
};

/** Période 1 : 3–17 octobre — mercredi 10h–18h30, samedi 10h–18h */
const PERIOD_1: MedShift[] = [
  { date: "2026-10-03", startTime: "10:00", endTime: "18:00", label: "Sam 03/10 10h–18h" },
  { date: "2026-10-07", startTime: "10:00", endTime: "18:30", label: "Mer 07/10 10h–18h30" },
  { date: "2026-10-10", startTime: "10:00", endTime: "18:00", label: "Sam 10/10 10h–18h" },
  { date: "2026-10-14", startTime: "10:00", endTime: "18:30", label: "Mer 14/10 10h–18h30" },
  { date: "2026-10-17", startTime: "10:00", endTime: "18:00", label: "Sam 17/10 10h–18h" },
];

/** Période 2 : 19–31 octobre (vacances scolaires) */
const PERIOD_2: MedShift[] = [
  { date: "2026-10-20", startTime: "13:00", endTime: "18:30", label: "Mar 20/10 13h–18h30" },
  { date: "2026-10-21", startTime: "10:00", endTime: "18:30", label: "Mer 21/10 10h–18h30" },
  { date: "2026-10-23", startTime: "13:00", endTime: "18:30", label: "Ven 23/10 13h–18h30" },
  { date: "2026-10-24", startTime: "10:00", endTime: "18:00", label: "Sam 24/10 10h–18h" },
  { date: "2026-10-27", startTime: "13:00", endTime: "18:30", label: "Mar 27/10 13h–18h30" },
  { date: "2026-10-28", startTime: "10:00", endTime: "18:30", label: "Mer 28/10 10h–18h30" },
  { date: "2026-10-30", startTime: "13:00", endTime: "18:30", label: "Ven 30/10 13h–18h30" },
  { date: "2026-10-31", startTime: "10:00", endTime: "18:00", label: "Sam 31/10 10h–18h" },
];

export const MEDIATHEQUE_OCTOBER_2026_SHIFTS = [...PERIOD_1, ...PERIOD_2];

export function mediathequeOct2026RequirementRows(siteId: string) {
  return MEDIATHEQUE_OCTOBER_2026_SHIFTS.map((s) => ({
    siteId,
    ...toRequirementCreateData({
      label: s.label,
      days: [],
      shiftType: ShiftType.DAY,
      startTime: s.startTime,
      endTime: s.endTime,
      role: PositionRole.AGENT,
      agentCount: 1,
      priority: 1,
      specificDate: s.date,
    }),
  }));
}
