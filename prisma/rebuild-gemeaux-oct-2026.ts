/**
 * Octobre 2026 — Les Gémeaux only.
 *
 * 1. Supprime toutes les affectations d'octobre SAUF Médiathèque (confirmée).
 * 2. Remet les postes Gémeaux au même effectif que septembre (spec Lajimi).
 * 3. Replanifie Gémeaux selon la consigne client (CHARGUI joker, minimisé).
 *
 * Run: npx tsx prisma/rebuild-gemeaux-oct-2026.ts
 */
import {
  DayOfWeek,
  PositionRole,
  PrismaClient,
  ShiftType,
} from "@prisma/client";
import {
  GEMEAUX_REQUIREMENTS,
  toRequirementCreateData,
} from "./site-requirements-lajimi";
import { calculateShiftHours } from "../src/lib/planning/hours";
import {
  getDayOfWeek,
  isWeekendDateKey,
  parseDateKey,
  toDateKey,
} from "../src/lib/planning/dates";
import { weekendPeriodKey } from "../src/lib/planning/weekends";
import {
  isRequirementSupersededOnDate,
  toShiftTemplate,
} from "../src/lib/planning/shift-templates";

const prisma = new PrismaClient();

const YEAR = 2026;
const MONTH = 10;
const LAST = 31;

const MON_THU_SAT = new Set<DayOfWeek>([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
]);
const FRI_SAT_SUN = new Set<DayOfWeek>([
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
]);

type Slot = {
  dateKey: string;
  date: Date;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  shiftType: ShiftType;
  role: PositionRole;
  requirementId: string;
  hours: number;
  night: boolean;
  weekend: boolean;
};

function dateKeysOfMonth(): string[] {
  return Array.from({ length: LAST }, (_, i) => {
    const d = i + 1;
    return `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  });
}

function maxRun(dates: string[]): number {
  if (dates.length === 0) return 0;
  const sorted = [...dates].sort();
  let run = 1;
  let max = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseDateKey(sorted[i - 1]!);
    const curr = parseDateKey(sorted[i]!);
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) {
      run++;
      max = Math.max(max, run);
    } else run = 1;
  }
  return max;
}

function weekendCount(dates: string[]): number {
  const weeks = new Set<string>();
  for (const dk of dates) {
    if (!isWeekendDateKey(dk)) continue;
    weeks.add(weekendPeriodKey(parseDateKey(dk)));
  }
  return weeks.size;
}

async function main() {
  const pm = await prisma.planningMonth.findFirst({
    where: { year: YEAR, month: MONTH },
  });
  const gem = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
  });
  const med = await prisma.site.findFirst({
    where: { OR: [{ name: { contains: "Horloge" } }, { name: { contains: "Médiath" } }] },
  });
  if (!pm || !gem || !med) {
    console.error("Mois / Gémeaux / Médiathèque introuvable");
    process.exit(1);
  }

  const keep = await prisma.assignment.count({
    where: { planningMonthId: pm.id, siteId: med.id },
  });
  const deleted = await prisma.assignment.deleteMany({
    where: { planningMonthId: pm.id, siteId: { not: med.id } },
  });
  console.log(
    `1. Affectations oct. 2026 hors Médiathèque: ${deleted.count} supprimées (Médiathèque conservée: ${keep})`
  );

  await prisma.siteRequirement.deleteMany({ where: { siteId: gem.id } });
  await prisma.siteRequirement.createMany({
    data: GEMEAUX_REQUIREMENTS.map((req) => ({
      siteId: gem.id,
      ...toRequirementCreateData(req),
    })),
  });
  console.log(
    `2. Postes Gémeaux rétablis (${GEMEAUX_REQUIREMENTS.length} récurrents, effectif septembre)`
  );

  const reqs = await prisma.siteRequirement.findMany({
    where: { siteId: gem.id, active: true },
  });
  const templates = reqs.map(toShiftTemplate);
  const slots: Slot[] = [];
  for (const dk of dateKeysOfMonth()) {
    const date = parseDateKey(dk);
    const day = getDayOfWeek(date);
    const dayTemplates = templates.filter((t) => {
      if (t.specificDate) return t.specificDate === dk;
      if (!t.days.includes(day)) return false;
      return !isRequirementSupersededOnDate(t, dk, templates);
    });
    for (const t of dayTemplates) {
      const req = reqs.find((r) => r.id === t.id)!;
      for (let i = 0; i < t.agentCount; i++) {
        slots.push({
          dateKey: dk,
          date,
          day,
          startTime: t.startTime,
          endTime: t.endTime,
          shiftType: t.shiftType,
          role: req.role,
          requirementId: t.id,
          hours: calculateShiftHours(t.startTime, t.endTime),
          night: t.shiftType === ShiftType.NIGHT,
          weekend: isWeekendDateKey(dk),
        });
      }
    }
  }
  console.log(`   ${slots.length} postes à pourvoir`);

  const lastNames = [
    "LAJIMI",
    "DJEDIA",
    "DIAKITE",
    "DEMBELE",
    "SEITI",
    "HOUNGUES",
    "EVINA",
    "KIBRI",
    "DORCE",
    "CHARGUI",
    "YAHMADI",
  ];
  const agents = await prisma.agent.findMany({
    where: { lastName: { in: lastNames } },
  });
  const byLn = new Map(agents.map((a) => [a.lastName.toUpperCase(), a]));
  for (const ln of lastNames) {
    if (!byLn.has(ln)) {
      console.error(`Agent ${ln} introuvable`);
      process.exit(1);
    }
  }

  const kibri = byLn.get("KIBRI")!;
  const medRows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, agentId: kibri.id, siteId: med.id },
  });
  const kibriMedDates = new Set(medRows.map((r) => toDateKey(r.date)));
  const kibriMedHours = medRows.reduce(
    (s, r) => s + (r.hours ?? calculateShiftHours(r.startTime, r.endTime)),
    0
  );
  console.log(
    `   KIBRI Médiathèque: ${medRows.length} vac / ${kibriMedHours.toFixed(1)} h → reste ${(156 - kibriMedHours).toFixed(1)} h à Gémeaux`
  );

  type AgentState = {
    ln: string;
    id: string;
    dates: string[];
    hours: number;
    maxH: number;
    maxVac: number;
    maxConsec: number;
    maxWe: number | null;
    dayOnly: boolean;
    nightOnly: boolean;
    allowedDays: Set<DayOfWeek> | null;
    minDate: string | null;
    blockedDates: Set<string>;
    otherWorkDates?: string[];
    canLead: boolean;
    preferLead: boolean;
    filler: boolean;
  };

  const states = new Map<string, AgentState>();
  function addState(partial: Omit<AgentState, "dates" | "hours" | "id"> & { hours?: number }) {
    const ag = byLn.get(partial.ln)!;
    states.set(partial.ln, {
      ...partial,
      id: ag.id,
      dates: [],
      hours: partial.hours ?? 0,
      otherWorkDates: partial.otherWorkDates ?? [],
    });
  }

  addState({
    ln: "LAJIMI",
    maxH: 156,
    maxVac: 13,
    maxConsec: 3,
    maxWe: 3,
    dayOnly: true,
    nightOnly: false,
    allowedDays: MON_THU_SAT,
    minDate: null,
    blockedDates: new Set(),
    canLead: true,
    preferLead: true,
    filler: false,
  });
  addState({
    ln: "DJEDIA",
    maxH: 156,
    maxVac: 13,
    maxConsec: 3,
    maxWe: 2,
    dayOnly: true,
    nightOnly: false,
    allowedDays: MON_THU_SAT,
    minDate: null,
    blockedDates: new Set(),
    canLead: true,
    preferLead: false,
    filler: false,
  });
  addState({
    ln: "DIAKITE",
    maxH: 156,
    maxVac: 13,
    maxConsec: 3,
    maxWe: 2,
    dayOnly: false,
    nightOnly: true,
    allowedDays: null,
    minDate: null,
    blockedDates: new Set(),
    canLead: false,
    preferLead: false,
    filler: false,
  });
  addState({
    ln: "DEMBELE",
    maxH: 156,
    maxVac: 13,
    maxConsec: 5,
    maxWe: 2,
    dayOnly: true,
    nightOnly: false,
    allowedDays: null,
    minDate: null,
    blockedDates: new Set(),
    canLead: false,
    preferLead: false,
    filler: false,
  });
  addState({
    ln: "SEITI",
    maxH: 156,
    maxVac: 13,
    maxConsec: 5,
    maxWe: 2,
    dayOnly: true,
    nightOnly: false,
    allowedDays: null,
    minDate: null,
    blockedDates: new Set(),
    canLead: false,
    preferLead: false,
    filler: false,
  });
  addState({
    ln: "HOUNGUES",
    maxH: 120,
    maxVac: 10,
    maxConsec: 5,
    maxWe: 2,
    dayOnly: true,
    nightOnly: false,
    allowedDays: null,
    minDate: null,
    blockedDates: new Set(),
    canLead: false,
    preferLead: false,
    filler: false,
  });
  addState({
    ln: "EVINA",
    maxH: 94,
    maxVac: 8,
    maxConsec: 5,
    maxWe: 3,
    dayOnly: true,
    nightOnly: false,
    allowedDays: null,
    minDate: null,
    blockedDates: new Set(["2026-10-01"]),
    canLead: true,
    preferLead: false,
    filler: false,
  });
  addState({
    ln: "KIBRI",
    maxH: 156,
    maxVac: 99,
    maxConsec: 5,
    maxWe: null,
    dayOnly: true,
    nightOnly: false,
    allowedDays: null,
    minDate: null,
    blockedDates: kibriMedDates,
    otherWorkDates: [...kibriMedDates],
    canLead: false,
    preferLead: false,
    filler: false,
    hours: kibriMedHours,
  });
  addState({
    ln: "DORCE",
    maxH: 156,
    maxVac: 13,
    maxConsec: 5,
    maxWe: 3,
    dayOnly: false,
    nightOnly: false,
    allowedDays: null,
    minDate: "2026-10-16",
    blockedDates: new Set(),
    canLead: true,
    preferLead: false,
    filler: true,
  });
  addState({
    ln: "YAHMADI",
    maxH: 156,
    maxVac: 13,
    maxConsec: 7,
    maxWe: 3,
    dayOnly: false,
    nightOnly: true,
    allowedDays: null,
    minDate: null,
    blockedDates: new Set(),
    canLead: false,
    preferLead: false,
    filler: true,
  });
  addState({
    ln: "CHARGUI",
    maxH: 96,
    maxVac: 8,
    maxConsec: 5,
    maxWe: 4,
    dayOnly: false,
    nightOnly: false,
    allowedDays: null,
    minDate: null,
    blockedDates: new Set(),
    canLead: true,
    preferLead: false,
    filler: true,
  });

  const assignment: (string | null)[] = slots.map(() => null);

  function canTake(ln: string, slot: Slot, opts?: { ignoreQuota?: boolean }): boolean {
    const s = states.get(ln)!;
    if (s.dates.includes(slot.dateKey)) return false;
    if (s.blockedDates.has(slot.dateKey)) return false;
    if (s.minDate && slot.dateKey < s.minDate) return false;
    if (s.dayOnly && slot.night) return false;
    if (s.nightOnly && !slot.night) return false;
    if (s.allowedDays && !s.allowedDays.has(slot.day)) return false;
    if (slot.role === PositionRole.TEAM_LEADER && !s.canLead) return false;
    if (slot.hours < 12 && !s.filler && ln !== "EVINA") return false;
    if (ln === "DIAKITE" && slot.dateKey >= "2026-10-19" && !FRI_SAT_SUN.has(slot.day)) {
      return false;
    }
    if (s.dates.length >= s.maxVac && !opts?.ignoreQuota) return false;
    if (s.hours + slot.hours > s.maxH + 0.05 && !opts?.ignoreQuota) return false;
    const nextDates = [...s.dates, slot.dateKey, ...(s.otherWorkDates ?? [])];
    if (maxRun(nextDates) > s.maxConsec) return false;
    if (s.maxWe != null && weekendCount(nextDates) > s.maxWe) return false;
    return true;
  }

  function place(ln: string, slotIndex: number) {
    const slot = slots[slotIndex]!;
    if (assignment[slotIndex]) {
      throw new Error(`slot ${slot.dateKey} ${slot.startTime} déjà pris`);
    }
    assignment[slotIndex] = ln;
    const s = states.get(ln)!;
    s.dates.push(slot.dateKey);
    s.hours += slot.hours;
  }

  function openIndexes(): number[] {
    return slots.map((_, i) => i).filter((i) => !assignment[i]);
  }

  function findOpen(
    pred: (slot: Slot, i: number) => boolean
  ): number[] {
    return openIndexes().filter((i) => pred(slots[i]!, i));
  }

  /** Place locked named shifts: first matching open slot that day/role/hours. */
  function lock(ln: string, dateKey: string, role: PositionRole, night: boolean, start?: string) {
    const idx = findOpen(
      (sl) =>
        sl.dateKey === dateKey &&
        sl.role === role &&
        sl.night === night &&
        (start ? sl.startTime === start : sl.startTime === "07:00" || sl.startTime === "19:00")
    )[0];
    if (idx == null) {
      console.error(`! lock ${ln} ${dateKey} ${role} ${night ? "nuit" : "jour"} introuvable`);
      return false;
    }
    if (!canTake(ln, slots[idx]!)) {
      console.error(
        `! lock ${ln} ${dateKey} refusé (${slots[idx]!.startTime}-${slots[idx]!.endTime} ${slots[idx]!.role})`
      );
      return false;
    }
    place(ln, idx);
    return true;
  }

  console.log("3. Postes verrouillés (LAJIMI / DJEDIA / EVINA / DIAKITE / KIBRI)");

  const lajimiTl = [
    "2026-10-01",
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-10",
    "2026-10-12",
    "2026-10-13",
    "2026-10-17",
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-24",
    "2026-10-26",
  ];
  for (const dk of lajimiTl) lock("LAJIMI", dk, PositionRole.TEAM_LEADER, false);

  const djediaTl = [
    "2026-10-03",
    "2026-10-08",
    "2026-10-14",
    "2026-10-15",
    "2026-10-22",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
  ];
  for (const dk of djediaTl) lock("DJEDIA", dk, PositionRole.TEAM_LEADER, false);

  const djediaAg = ["2026-10-01", "2026-10-06", "2026-10-12", "2026-10-17", "2026-10-21"];
  for (const dk of djediaAg) lock("DJEDIA", dk, PositionRole.AGENT, false, "07:00");

  for (const dk of ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]) {
    lock("EVINA", dk, PositionRole.TEAM_LEADER, false);
  }
  lock("EVINA", "2026-10-04", PositionRole.AGENT, false, "07:00");
  lock("EVINA", "2026-10-11", PositionRole.AGENT, false, "07:00");
  lock("EVINA", "2026-10-31", PositionRole.AGENT, false, "08:00");
  lock("CHARGUI", "2026-10-03", PositionRole.AGENT, false, "08:00");
  lock("DORCE", "2026-10-31", PositionRole.TEAM_LEADER, false);
  lock("CHARGUI", "2026-10-31", PositionRole.AGENT, false, "07:00");
  lock("YAHMADI", "2026-10-26", PositionRole.AGENT, true);
  lock("DORCE", "2026-10-30", PositionRole.AGENT, false, "07:00");

  const diakiteNights = [
    "2026-10-01",
    "2026-10-02",
    "2026-10-06",
    "2026-10-08",
    "2026-10-09",
    "2026-10-12",
    "2026-10-15",
    "2026-10-16",
    "2026-10-23",
    "2026-10-24",
    "2026-10-25",
    "2026-10-30",
    "2026-10-31",
  ];
  for (const dk of diakiteNights) lock("DIAKITE", dk, PositionRole.AGENT, true);

  for (const dk of ["2026-10-01", "2026-10-05", "2026-10-08", "2026-10-13", "2026-10-19"]) {
    lock("KIBRI", dk, PositionRole.AGENT, false, "07:00");
  }

  function pickBest(slot: Slot, names: string[], opts?: { ignoreQuota?: boolean }): string | null {
    const eligible = names.filter((ln) => canTake(ln, slot, opts));
    if (eligible.length === 0) return null;
    eligible.sort((a, b) => {
      const sa = states.get(a)!;
      const sb = states.get(b)!;
      const aNeed = sa.filler ? -1 : sa.maxVac - sa.dates.length;
      const bNeed = sb.filler ? -1 : sb.maxVac - sb.dates.length;
      if (aNeed !== bNeed) return bNeed - aNeed;
      const aH = sa.maxH - sa.hours;
      const bH = sb.maxH - sb.hours;
      if (Math.abs(aH - bH) > 0.2) return bH - aH;
      if (a === "CHARGUI") return 1;
      if (b === "CHARGUI") return -1;
      return a.localeCompare(b);
    });
    return eligible[0]!;
  }

  const quotaDay = ["DEMBELE", "SEITI", "HOUNGUES"];
  const fillerDay = ["DORCE", "EVINA", "CHARGUI"];
  const fillerNight = ["YAHMADI", "DORCE", "CHARGUI"];
  const leftoverLead = ["DJEDIA", "DORCE", "CHARGUI", "EVINA"];

  console.log("4. Remplissage greedy (quotas puis jokers)");

  const order = openIndexes().sort((a, b) => {
    const sa = slots[a]!;
    const sb = slots[b]!;
    if (sa.dateKey !== sb.dateKey) return sa.dateKey.localeCompare(sb.dateKey);
    if (sa.role !== sb.role) {
      return sa.role === PositionRole.TEAM_LEADER ? -1 : 1;
    }
    if (sa.night !== sb.night) return sa.night ? 1 : -1;
    return sa.startTime.localeCompare(sb.startTime);
  });

  for (const i of order) {
    const sl = slots[i]!;
    let ln: string | null = null;
    if (sl.role === PositionRole.TEAM_LEADER) {
      ln = pickBest(sl, leftoverLead);
    } else if (sl.night) {
      ln = pickBest(sl, ["DIAKITE", ...fillerNight]);
    } else {
      ln = pickBest(sl, quotaDay) ?? pickBest(sl, fillerDay);
    }
    if (ln) place(ln, i);
  }

  let open = openIndexes();
  if (open.length) {
    console.log(`   ${open.length} postes encore ouverts — relâchement jokers`);
    for (const i of open) {
      const sl = slots[i]!;
      const names = sl.night
        ? ["YAHMADI", "DORCE", "CHARGUI"]
        : sl.role === PositionRole.TEAM_LEADER
          ? ["DORCE", "CHARGUI"]
          : ["DORCE", "CHARGUI"];
      const ln = pickBest(sl, names, { ignoreQuota: true }) ?? pickBest(sl, names);
      if (ln && (canTake(ln, sl, { ignoreQuota: true }) || canTake(ln, sl))) {
        const s = states.get(ln)!;
        if (!s.dates.includes(sl.dateKey)) {
          assignment[i] = ln;
          s.dates.push(sl.dateKey);
          s.hours += sl.hours;
        }
      }
    }
  }

  open = openIndexes();
  if (open.length) {
    console.log("   Postes non pourvus:");
    for (const i of open) {
      const sl = slots[i]!;
      console.log(
        `     ${sl.dateKey} ${sl.day.slice(0, 3)} ${sl.role} ${sl.startTime}-${sl.endTime}`
      );
    }
  }

  const rows = slots
    .map((sl, i) => {
      const ln = assignment[i];
      if (!ln) return null;
      const s = states.get(ln)!;
      return {
        planningMonthId: pm.id,
        agentId: s.id,
        siteId: gem.id,
        requirementId: sl.requirementId,
        date: sl.date,
        shiftType: sl.shiftType,
        role: sl.role,
        startTime: sl.startTime,
        endTime: sl.endTime,
        hours: sl.hours,
        notes: "rebuild oct. 2026 Gémeaux",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  await prisma.assignment.createMany({ data: rows });
  console.log(`5. ${rows.length}/${slots.length} affectations créées`);

  console.log("\n--- Heures Gémeaux ---");
  for (const ln of lastNames) {
    const s = states.get(ln)!;
    const extra =
      ln === "KIBRI" ? `  (dont ${kibriMedHours.toFixed(1)} h Médiathèque → total ${s.hours.toFixed(1)})` : "";
    const gemH = ln === "KIBRI" ? s.hours - kibriMedHours : s.hours;
    const gemVac = s.dates.length;
    console.log(
      `  ${ln.padEnd(10)} ${gemH.toFixed(1).padStart(6)} h  (${gemVac} vac)${extra}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
