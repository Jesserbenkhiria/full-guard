/**
 * Reconstruction Les Gémeaux — octobre 2026 UNIQUEMENT.
 * Ne touche PAS à la Médiathèque (ni aux affectations KIBRI sur ce site).
 *
 * Run: npx tsx prisma/fix-gemeaux-oct-2026-only.ts
 */
import {
  DayOfWeek,
  PositionRole,
  PrismaClient,
  ShiftType,
} from "@prisma/client";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";
import { assignmentsMatchSlot } from "../src/lib/planning/shift-templates";

const prisma = new PrismaClient();

const OCT_DAYS = Array.from({ length: 31 }, (_, i) =>
  `2026-10-${String(i + 1).padStart(2, "0")}`
);

/** DJEDIA — lun–mar–mer–jeu–sam (comme LAJIMI, jour AGENT). */
const DJEDIA_DAYS = new Set<DayOfWeek>([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
]);

/** Max 3 vacations consécutives (jour ou nuit) — spec Lajimi 14/09/2026. */
const MAX_CONSECUTIVE_WORK_DAYS = 3;

function exceedsConsecutiveLimit(busyDates: Set<string>, dateKey: string): boolean {
  if (busyDates.has(dateKey)) return true;
  const sorted = [...busyDates, dateKey].sort();
  let run = 1;
  let maxRun = 1;
  for (let i = 1; i < sorted.length; i++) {
    const a = parseDateKey(sorted[i - 1]!);
    const b = parseDateKey(sorted[i]!);
    const diffDays = Math.round((b.getTime() - a.getTime()) / 86_400_000);
    if (diffDays === 1) {
      run++;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 1;
    }
  }
  return maxRun > MAX_CONSECUTIVE_WORK_DAYS;
}

const LAJIMI_DAYS = new Set<DayOfWeek>([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
]);

const WEEKEND = new Set<DayOfWeek>([DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]);

const FRI_SAT_SUN = new Set<DayOfWeek>([
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
]);

/** À partir du 19/10, DIAKITE : ven–sam soir uniquement (pas dimanche). */
const FRI_SAT = new Set<DayOfWeek>([DayOfWeek.FRIDAY, DayOfWeek.SATURDAY]);

const EVINA_DAYS = new Set<DayOfWeek>([
  DayOfWeek.FRIDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
]);

const MANAGED = [
  "DJEDIA",
  "DIAKITE",
  "DEMBELE",
  "SEITI",
  "HOUNGUES",
  "EVINA",
  "DORCE",
  "CHARGUI",
  "KIBRI",
  "LAJIMI",
];

function isNight(shiftType: ShiftType, startTime: string, endTime: string): boolean {
  return shiftType === ShiftType.NIGHT || endTime < startTime;
}

type AgentState = {
  id: string;
  lastName: string;
  h: number;
  cnt: number;
  maxH: number;
  maxS: number;
  busyDates: Set<string>;
};

function agentCaps(lastName: string): { maxH: number; maxS: number } {
  switch (lastName.toUpperCase()) {
    case "HOUNGUES":
      return { maxH: 120, maxS: 10 };
    case "EVINA":
      return { maxH: 80, maxS: 99 };
    case "CHARGUI":
      return { maxH: 192, maxS: 16 };
    case "DJEDIA":
      return { maxH: 200, maxS: 20 };
    case "DEMBELE":
      return { maxH: 180, maxS: 15 };
    case "KIBRI":
      return { maxH: 156, maxS: 99 };
    case "YAHMADI":
      return { maxH: 200, maxS: 20 };
    default:
      return { maxH: 156, maxS: 13 };
  }
}

function canAssign(
  ln: string,
  dateKey: string,
  day: DayOfWeek,
  req: { shiftType: ShiftType; startTime: string; endTime: string; role: PositionRole },
  pleyelBusy: Set<string>,
  medBusy: Set<string>
): boolean {
  const night = isNight(req.shiftType, req.startTime, req.endTime);
  const up = ln.toUpperCase();

  if (up === "KIBRI") {
    if (medBusy.has(dateKey)) return false;
    if (pleyelBusy.has(dateKey)) return false;
    return req.role === PositionRole.AGENT && !night;
  }
  if (up === "DORCE" && pleyelBusy.has(dateKey)) return false;

  if (up === "DJEDIA") {
    return DJEDIA_DAYS.has(day) && !night && req.role === PositionRole.AGENT;
  }
  if (up === "LAJIMI") return LAJIMI_DAYS.has(day) && !night && req.role === PositionRole.TEAM_LEADER;
  if (up === "DIAKITE") {
    if (!night) return false;
    if (dateKey >= "2026-10-19" && !FRI_SAT.has(day)) return false;
    return true;
  }
  if (up === "DEMBELE" || up === "SEITI" || up === "HOUNGUES") return !night && req.role === PositionRole.AGENT;
  if (up === "EVINA") {
    return (
      !night &&
      req.role === PositionRole.AGENT &&
      (day === DayOfWeek.FRIDAY || day === DayOfWeek.SATURDAY)
    );
  }
  if (up === "CHARGUI") return req.role === PositionRole.AGENT;
  if (up === "DORCE") return !night && req.role === PositionRole.AGENT;

  if (up === "YAHMADI") return night && req.role === PositionRole.AGENT;

  return false;
}

/** DIAKITE: d'abord ven–sam ≥19/10, puis début de mois — max 3 nuits à la filet. */
function datePriorityForAgent(ln: string, maxShifts = 13): string[] {
  if (ln.toUpperCase() !== "DIAKITE") return OCT_DAYS;

  const afterFriSat: string[] = [];
  const before: string[] = [];
  for (const d of OCT_DAYS) {
    const day = getDayOfWeek(parseDateKey(d));
    if (d >= "2026-10-19" && FRI_SAT.has(day)) afterFriSat.push(d);
    else if (d < "2026-10-19") before.push(d);
  }

  const picked: string[] = [];
  for (const d of pickDatesWithConsecutiveCap(afterFriSat, afterFriSat.length)) {
    if (picked.length >= maxShifts) break;
    if (!exceedsConsecutiveLimit(new Set(picked), d)) picked.push(d);
  }
  for (const d of pickDatesWithConsecutiveCap(before, before.length)) {
    if (picked.length >= maxShifts) break;
    if (!exceedsConsecutiveLimit(new Set(picked), d)) picked.push(d);
  }
  return picked.sort();
}

/** Choisit des dates en respectant max 3 jours consécutifs. */
function pickDatesWithConsecutiveCap(eligible: string[], count: number): string[] {
  const picked: string[] = [];
  const spread = spreadDates(eligible, eligible.length);
  for (const d of spread) {
    if (picked.length >= count) break;
    if (!exceedsConsecutiveLimit(new Set(picked), d)) picked.push(d);
  }
  for (const d of eligible) {
    if (picked.length >= count) break;
    if (picked.includes(d)) continue;
    if (!exceedsConsecutiveLimit(new Set(picked), d)) picked.push(d);
  }
  return picked.sort();
}

/** EVINA: vendredis en premier. */
function datePriorityEvina(): string[] {
  const fri: string[] = [];
  const rest: string[] = [];
  for (const d of OCT_DAYS) {
    if (getDayOfWeek(parseDateKey(d)) === DayOfWeek.FRIDAY) fri.push(d);
    else rest.push(d);
  }
  return [...fri, ...rest];
}

/** Répartit N vacations sur tout le mois (évite 1re ou 2e quinzaine vide). */
function spreadDates(eligible: string[], maxShifts: number): string[] {
  if (eligible.length <= maxShifts) return eligible;
  const picked: string[] = [];
  for (let i = 0; i < maxShifts; i++) {
    const idx = Math.round((i * (eligible.length - 1)) / Math.max(1, maxShifts - 1));
    picked.push(eligible[idx]);
  }
  return [...new Set(picked)];
}

/** Retire des vacations Gémeaux si un agent dépasse 3 jours consécutifs (tous sites confondus). */
async function enforceMax3ConsecutiveWorkDays(
  planningMonthId: string,
  gemeauxId: string
): Promise<number> {
  const all = await prisma.assignment.findMany({ where: { planningMonthId } });
  const gemRows = all.filter((a) => a.siteId === gemeauxId);
  const byAgent = new Map<string, typeof gemRows>();
  for (const g of gemRows) {
    const list = byAgent.get(g.agentId) ?? [];
    list.push(g);
    byAgent.set(g.agentId, list);
  }

  const toDelete: string[] = [];
  for (const [agentId, gems] of byAgent) {
    let workDates = new Set(all.filter((a) => a.agentId === agentId).map((a) => toDateKey(a.date)));
    let changed = true;
    while (changed) {
      changed = false;
      const sorted = [...workDates].sort();
      let runStart = 0;
      for (let i = 1; i <= sorted.length; i++) {
        const consecutive =
          i < sorted.length &&
          Math.round(
            (parseDateKey(sorted[i]!).getTime() - parseDateKey(sorted[i - 1]!).getTime()) / 86_400_000
          ) === 1;
        if (!consecutive) {
          const runLen = i - runStart;
          if (runLen > MAX_CONSECUTIVE_WORK_DAYS) {
            const removeDate = sorted[i - 1]!;
            const row = gems.find((g) => toDateKey(g.date) === removeDate && !toDelete.includes(g.id));
            if (row) {
              toDelete.push(row.id);
              workDates.delete(removeDate);
              changed = true;
              break;
            }
          }
          runStart = i;
        }
      }
    }
  }

  if (toDelete.length === 0) return 0;
  await prisma.assignment.deleteMany({ where: { id: { in: toDelete } } });
  return toDelete.length;
}

/** Supprime les affectations Gémeaux qui violent la spec client (sans toucher Médiathèque). */
async function enforceClientRulesOnGemeaux(
  planningMonthId: string,
  gemeauxId: string,
  medId: string | null
): Promise<number> {
  const rows = await prisma.assignment.findMany({
    where: { planningMonthId, siteId: gemeauxId },
    include: { agent: true },
  });
  const all = await prisma.assignment.findMany({ where: { planningMonthId } });

  const toDelete: string[] = [];
  for (const a of rows) {
    const ln = a.agent.lastName.toUpperCase();
    const dk = toDateKey(a.date);
    const day = getDayOfWeek(a.date);
    const night = isNight(a.shiftType, a.startTime, a.endTime);

    if (ln === "KIBRI" && medId) {
      const onMed = all.some(
        (x) => x.agentId === a.agentId && x.siteId === medId && toDateKey(x.date) === dk
      );
      if (onMed) toDelete.push(a.id);
    }
    if (ln === "DJEDIA") {
      if (!DJEDIA_DAYS.has(day) || night || a.role !== PositionRole.AGENT) toDelete.push(a.id);
    }
    if (ln === "LAJIMI") {
      if (!LAJIMI_DAYS.has(day) || night || a.role !== PositionRole.TEAM_LEADER) toDelete.push(a.id);
    }
    if (ln === "CHARGUI" && a.role !== PositionRole.AGENT) toDelete.push(a.id);
    if (ln === "EVINA") {
      if (night || a.role !== PositionRole.AGENT) toDelete.push(a.id);
      if (day !== DayOfWeek.FRIDAY && day !== DayOfWeek.SATURDAY) toDelete.push(a.id);
    }
    if (ln === "DIAKITE") {
      if (!night) toDelete.push(a.id);
      if (dk >= "2026-10-19" && !FRI_SAT.has(day)) toDelete.push(a.id);
    }
  }

  const ids = [...new Set(toDelete)];
  if (ids.length === 0) return 0;
  await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/** Recomble les postes vides après nettoyage (KIBRI, EVINA, jokers). */
async function refillGemeauxGaps(
  planningMonthId: string,
  gemeauxId: string,
  pleyelId: string,
  medId: string | null,
  reqs: { id: string; days: DayOfWeek[]; startTime: string; endTime: string; shiftType: ShiftType; role: PositionRole; agentCount: number }[]
): Promise<number> {
  const agents = await prisma.agent.findMany({
    where: { lastName: { in: [...MANAGED, "YAHMADI"], mode: "insensitive" }, active: true },
  });
  const agentByLn = new Map(agents.map((a) => [a.lastName.toUpperCase(), a]));

  const allRows = await prisma.assignment.findMany({ where: { planningMonthId } });
  const pleyelByAgent = new Map<string, Set<string>>();
  const medByAgent = new Map<string, Set<string>>();
  for (const a of allRows) {
    if (a.siteId === pleyelId) {
      const s = pleyelByAgent.get(a.agentId) ?? new Set<string>();
      s.add(toDateKey(a.date));
      pleyelByAgent.set(a.agentId, s);
    }
    if (medId && a.siteId === medId) {
      const s = medByAgent.get(a.agentId) ?? new Set<string>();
      s.add(toDateKey(a.date));
      medByAgent.set(a.agentId, s);
    }
  }

  const states = new Map<string, AgentState>();
  for (const ln of [...MANAGED, "YAHMADI"]) {
    const ag = agentByLn.get(ln);
    if (!ag) continue;
    const cap = agentCaps(ln);
    const mine = allRows.filter((r) => r.agentId === ag.id);
    const busy = new Set(mine.map((r) => toDateKey(r.date)));
    if (ln === "KIBRI" && medId) for (const d of medByAgent.get(ag.id) ?? []) busy.add(d);
    states.set(ln, {
      id: ag.id,
      lastName: ln,
      h: mine.reduce((s, r) => s + (r.hours ?? calculateShiftHours(r.startTime, r.endTime)), 0),
      cnt: mine.length,
      maxH: cap.maxH,
      maxS: cap.maxS,
      busyDates: busy,
    });
  }

  const gemRows = allRows.filter((r) => r.siteId === gemeauxId);
  const slotFilled = new Map<string, number>();
  for (const a of gemRows) {
    const sk = `${toDateKey(a.date)}|${a.startTime}|${a.endTime}|${a.role}`;
    slotFilled.set(sk, (slotFilled.get(sk) ?? 0) + 1);
  }

  const pending: {
    agentId: string;
    requirementId: string;
    date: Date;
    shiftType: ShiftType;
    role: PositionRole;
    startTime: string;
    endTime: string;
    hours: number;
    notes: string;
  }[] = [];

  function slotKey(dateKey: string, req: (typeof reqs)[0]) {
    return `${dateKey}|${req.startTime}|${req.endTime}|${req.role}`;
  }

  function tryOne(ln: string, dateKey: string, req: (typeof reqs)[0]): boolean {
    const st = states.get(ln);
    if (!st || st.busyDates.has(dateKey)) return false;
    if (exceedsConsecutiveLimit(st.busyDates, dateKey)) return false;
    const day = getDayOfWeek(parseDateKey(dateKey));
    const medBusy = medByAgent.get(st.id) ?? new Set<string>();
    const pleyelBusy = pleyelByAgent.get(st.id) ?? new Set<string>();
    if (
      !canAssign(ln, dateKey, day, {
        shiftType: req.shiftType,
        startTime: req.startTime,
        endTime: req.endTime,
        role: req.role ?? PositionRole.AGENT,
      }, pleyelBusy, medBusy)
    ) {
      return false;
    }
    const sk = slotKey(dateKey, req);
    if ((slotFilled.get(sk) ?? 0) >= req.agentCount) return false;
    const sh = calculateShiftHours(req.startTime, req.endTime);
    if (st.h + sh > st.maxH + 0.5 || st.cnt >= st.maxS) return false;

    pending.push({
      agentId: st.id,
      requirementId: req.id,
      date: parseDateKey(dateKey),
      shiftType: req.shiftType,
      role: req.role ?? PositionRole.AGENT,
      startTime: req.startTime,
      endTime: req.endTime,
      hours: sh,
      notes: `fix-gemeaux-refill ${ln}`,
    });
    st.h += sh;
    st.cnt++;
    st.busyDates.add(dateKey);
    slotFilled.set(sk, (slotFilled.get(sk) ?? 0) + 1);
    return true;
  }

  // KIBRI : remplacer un jour Gémeaux perdu (ex. conflit Médiathèque)
  const kibriSt = states.get("KIBRI");
  if (kibriSt && kibriSt.h < 156) {
    for (const dateKey of OCT_DAYS) {
      if (kibriSt.h >= 156) break;
      const dayReqs = reqs.filter((r) => r.days.includes(getDayOfWeek(parseDateKey(dateKey))));
      for (const req of dayReqs) {
        if (tryOne("KIBRI", dateKey, req)) break;
      }
    }
  }

  // EVINA → 80 h Gémeaux (vendredis + samedis courts si besoin)
  for (const dateKey of datePriorityEvina().concat(OCT_DAYS.filter((d) => getDayOfWeek(parseDateKey(d)) === DayOfWeek.SATURDAY))) {
    const st = states.get("EVINA");
    if (!st || st.h >= 80) break;
    const day = getDayOfWeek(parseDateKey(dateKey));
    const dayReqs = reqs
      .filter((r) => r.days.includes(day) && r.role === PositionRole.AGENT && !isNight(r.shiftType, r.startTime, r.endTime))
      .sort(
        (a, b) =>
          calculateShiftHours(a.startTime, a.endTime) - calculateShiftHours(b.startTime, b.endTime)
      );
    for (const req of dayReqs) {
      if (tryOne("EVINA", dateKey, req)) break;
    }
  }

  // Postes vides restants
  for (const dateKey of OCT_DAYS) {
    const day = getDayOfWeek(parseDateKey(dateKey));
    for (const req of reqs) {
      if (!req.days.includes(day)) continue;
      const sk = slotKey(dateKey, req);
      while ((slotFilled.get(sk) ?? 0) < req.agentCount) {
        let ok = false;
        const order =
          req.role === PositionRole.TEAM_LEADER
            ? ["LAJIMI"]
            : isNight(req.shiftType, req.startTime, req.endTime)
              ? ["CHARGUI", "DIAKITE", "YAHMADI"]
              : ["CHARGUI", "DORCE", "EVINA", "KIBRI", "DJEDIA", "DEMBELE", "SEITI", "HOUNGUES"];
        for (const ln of order) {
          if (tryOne(ln, dateKey, req)) {
            ok = true;
            break;
          }
        }
        if (!ok) break;
      }
    }
  }

  if (pending.length === 0) return 0;
  await prisma.assignment.createMany({
    data: pending.map((a) => ({ ...a, planningMonthId, siteId: gemeauxId })),
  });
  return pending.length;
}

function datesForAgent(ln: string, maxShifts: number): string[] {
  const up = ln.toUpperCase();
  if (up === "DIAKITE") return datePriorityForAgent(ln, maxShifts);
  if (up === "EVINA") return datePriorityEvina();
  if (up === "KIBRI") return OCT_DAYS;

  const eligible = OCT_DAYS.filter((d) => {
    const day = getDayOfWeek(parseDateKey(d));
    if (up === "LAJIMI") return LAJIMI_DAYS.has(day);
    if (up === "DJEDIA") return DJEDIA_DAYS.has(day);
    if (up === "CHARGUI") return true;
    return true;
  });

  if (["LAJIMI", "DJEDIA", "DEMBELE", "SEITI", "HOUNGUES", "DORCE"].includes(up)) {
    return spreadDates(eligible, maxShifts);
  }
  return eligible;
}

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) {
    console.error("Planning 2026-10 introuvable");
    process.exit(1);
  }

  const gemeaux = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const pleyel = await prisma.site.findFirst({ where: { name: "PLEYEL" } });
  const med = await prisma.site.findFirst({
    where: { OR: [{ name: { contains: "Horloge" } }, { name: { contains: "Médiath" } }] },
  });
  if (!gemeaux || !pleyel) {
    console.error("Sites manquants");
    process.exit(1);
  }

  const agents = await prisma.agent.findMany({
    where: { lastName: { in: MANAGED, mode: "insensitive" }, active: true },
  });
  const agentByLn = new Map(agents.map((a) => [a.lastName.toUpperCase(), a]));

  // Reset Gémeaux for managed agents only (Médiathèque intacte)
  const managedIds = agents.map((a) => a.id);
  const del = await prisma.assignment.deleteMany({
    where: { planningMonthId: pm.id, siteId: gemeaux.id, agentId: { in: managedIds } },
  });
  console.log(`✓ Gémeaux: ${del.count} affectations supprimées (agents gérés)`);

  // EVINA oct. 2026 : objectif 80 h sur Gémeaux (client) — retirer LE DOUZE pour libérer le quota
  const douze = await prisma.site.findFirst({ where: { name: "LE DOUZE" } });
  const evinaAgent = agents.find((a) => a.lastName.toUpperCase() === "EVINA");
  if (douze && evinaAgent) {
    const dDel = await prisma.assignment.deleteMany({
      where: { planningMonthId: pm.id, agentId: evinaAgent.id, siteId: douze.id },
    });
    if (dDel.count > 0) console.log(`✓ EVINA: ${dDel.count} vacation(s) LE DOUZE retirées (cible 80 h Gémeaux)`);
  }

  // Remove HALIDI from Gémeaux if present
  const halidi = await prisma.agent.findFirst({ where: { lastName: "HALIDI" } });
  if (halidi) {
    const hDel = await prisma.assignment.deleteMany({
      where: { planningMonthId: pm.id, siteId: gemeaux.id, agentId: halidi.id },
    });
    if (hDel.count) console.log(`✓ HALIDI: ${hDel.count} affectation(s) retirée(s)`);
  }

  const aoufi = await prisma.agent.findFirst({ where: { lastName: "AOUFI", active: true } });
  if (aoufi) {
    const aDel = await prisma.assignment.deleteMany({
      where: { planningMonthId: pm.id, siteId: gemeaux.id, agentId: aoufi.id },
    });
    if (aDel.count) console.log(`✓ AOUFI: ${aDel.count} affectation(s) Gémeaux retirées (spec client)`);
  }

  const allReqs = await prisma.siteRequirement.findMany({
    where: { siteId: gemeaux.id, active: true },
  });
  const reqs = allReqs.filter((r) => r.specificDate === null);

  const pleyelByAgent = new Map<string, Set<string>>();
  const pleyelRows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: pleyel.id },
  });
  for (const a of pleyelRows) {
    const set = pleyelByAgent.get(a.agentId) ?? new Set<string>();
    set.add(toDateKey(a.date));
    pleyelByAgent.set(a.agentId, set);
  }

  const medBusyByAgent = new Map<string, Set<string>>();
  if (med) {
    const medRows = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, siteId: med.id },
    });
    for (const a of medRows) {
      const set = medBusyByAgent.get(a.agentId) ?? new Set<string>();
      set.add(toDateKey(a.date));
      medBusyByAgent.set(a.agentId, set);
    }
  }

  // Non-gemeaux hours (LE DOUZE etc.) for cap
  const otherSiteHours = new Map<string, number>();
  const otherRows = await prisma.assignment.findMany({
    where: {
      planningMonthId: pm.id,
      siteId: { not: gemeaux.id },
      agentId: { in: managedIds },
    },
  });
  for (const a of otherRows) {
    const ln = agents.find((x) => x.id === a.agentId)?.lastName.toUpperCase() ?? "";
    otherSiteHours.set(
      ln,
      (otherSiteHours.get(ln) ?? 0) + (a.hours ?? calculateShiftHours(a.startTime, a.endTime))
    );
  }

  // Postes déjà pourvus (YAHMADI, AOUFI, etc.) — ne pas double-compter
  const remainingGem = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: gemeaux.id },
    include: { agent: true },
  });
  const slotFilled = new Map<string, number>();
  for (const a of remainingGem) {
    const req = reqs.find((r) => r.id === a.requirementId);
    const role = a.role ?? req?.role ?? PositionRole.AGENT;
    const sk = `${toDateKey(a.date)}|${a.startTime}|${a.endTime}|${role}`;
    slotFilled.set(sk, (slotFilled.get(sk) ?? 0) + 1);
  }

  const states = new Map<string, AgentState>();
  for (const ln of MANAGED) {
    const ag = agentByLn.get(ln);
    if (!ag) continue;
    const cap = agentCaps(ln);
    const ext = otherSiteHours.get(ln) ?? 0;
    const busy = new Set(
      otherRows.filter((r) => r.agentId === ag.id).map((r) => toDateKey(r.date))
    );
    if (ln === "KIBRI" && med) {
      for (const d of medBusyByAgent.get(ag.id) ?? []) busy.add(d);
    }
    states.set(ln, {
      id: ag.id,
      lastName: ln,
      h: ext,
      cnt: otherRows.filter((r) => r.agentId === ag.id).length,
      maxH: cap.maxH,
      maxS: cap.maxS,
      busyDates: busy,
    });
  }

  const gemeauxAssignments: {
    agentId: string;
    requirementId: string;
    date: Date;
    shiftType: ShiftType;
    role: PositionRole;
    startTime: string;
    endTime: string;
    hours: number;
    notes: string;
  }[] = [];

  function slotKey(dateKey: string, req: (typeof reqs)[0]) {
    return `${dateKey}|${req.startTime}|${req.endTime}|${req.role}`;
  }

  function tryAssign(
    ln: string,
    dateKey: string,
    req: (typeof reqs)[0]
  ): boolean {
    const st = states.get(ln);
    if (!st) return false;
    if (st.busyDates.has(dateKey)) return false;
    if (exceedsConsecutiveLimit(st.busyDates, dateKey)) return false;

    const day = getDayOfWeek(parseDateKey(dateKey));
    const pleyelBusy = pleyelByAgent.get(st.id) ?? new Set<string>();
    const medBusy = medBusyByAgent.get(st.id) ?? new Set<string>();

    if (
      !canAssign(ln, dateKey, day, {
        shiftType: req.shiftType,
        startTime: req.startTime,
        endTime: req.endTime,
        role: req.role ?? PositionRole.AGENT,
      }, pleyelBusy, medBusy)
    ) {
      return false;
    }

    const sk = slotKey(dateKey, req);
    if ((slotFilled.get(sk) ?? 0) >= req.agentCount) return false;

    const sh = calculateShiftHours(req.startTime, req.endTime);
    if (st.h + sh > st.maxH + 0.5) return false;
    if (st.cnt >= st.maxS) return false;

    gemeauxAssignments.push({
      agentId: st.id,
      requirementId: req.id,
      date: parseDateKey(dateKey),
      shiftType: req.shiftType,
      role: req.role ?? PositionRole.AGENT,
      startTime: req.startTime,
      endTime: req.endTime,
      hours: sh,
      notes: `fix-gemeaux-oct ${ln}`,
    });

    st.h += sh;
    st.cnt++;
    st.busyDates.add(dateKey);
    slotFilled.set(sk, (slotFilled.get(sk) ?? 0) + 1);
    return true;
  }

  /** Ordre de remplissage des agents (priorité client). */
  const fillOrder = [
    "LAJIMI",
    "KIBRI",
    "CHARGUI",
    "DJEDIA",
    "DIAKITE",
    "EVINA",
    "DEMBELE",
    "SEITI",
    "HOUNGUES",
    "DORCE",
  ];

  // DIAKITE : réserver en priorité absolue les nuits ven–sam–dim du 19/10 au 31/10
  for (const dateKey of datePriorityForAgent("DIAKITE", agentCaps("DIAKITE").maxS)) {
    if (dateKey < "2026-10-19") continue;
    const day = getDayOfWeek(parseDateKey(dateKey));
    if (!FRI_SAT.has(day)) continue;
    const dayReqs = reqs.filter((r) => r.days.includes(day));
    for (const req of dayReqs) {
      if (!isNight(req.shiftType, req.startTime, req.endTime)) continue;
      tryAssign("DIAKITE", dateKey, req);
    }
  }

  for (const ln of fillOrder) {
    const cap = agentCaps(ln);
    let dates = ln === "DEMBELE" ? spreadDates(OCT_DAYS, cap.maxS) : datesForAgent(ln, cap.maxS);
    if (ln === "KIBRI") {
      const medBusy = medBusyByAgent.get(states.get("KIBRI")?.id ?? "") ?? new Set<string>();
      dates = dates.filter((d) => !medBusy.has(d));
    }

    for (const dateKey of dates) {
      const st = states.get(ln);
      if (!st || st.h >= st.maxH || st.cnt >= st.maxS) break;

      const day = getDayOfWeek(parseDateKey(dateKey));
      const dayReqs = reqs.filter((r) => r.days.includes(day));

      // TEAM_LEADER avant AGENT pour LAJIMI ; ordre explicite sinon
      const ordered = [...dayReqs].sort((a, b) => {
        if (ln === "LAJIMI") {
          if (a.role === PositionRole.TEAM_LEADER && b.role !== PositionRole.TEAM_LEADER) return -1;
          if (b.role === PositionRole.TEAM_LEADER && a.role !== PositionRole.TEAM_LEADER) return 1;
        }
        if (ln === "DJEDIA") {
          if (a.role === PositionRole.AGENT && b.role === PositionRole.TEAM_LEADER) return -1;
          if (b.role === PositionRole.AGENT && a.role === PositionRole.TEAM_LEADER) return 1;
        }
        if (ln === "DIAKITE") {
          if (a.shiftType === ShiftType.NIGHT && b.shiftType !== ShiftType.NIGHT) return -1;
          if (b.shiftType === ShiftType.NIGHT && a.shiftType !== ShiftType.NIGHT) return 1;
        }
        if (a.shiftType === ShiftType.DAY && b.shiftType === ShiftType.NIGHT) return -1;
        if (b.shiftType === ShiftType.DAY && a.shiftType === ShiftType.NIGHT) return 1;
        return 0;
      });
      for (const req of ordered) {
        if (tryAssign(ln, dateKey, req)) break;
      }
    }
  }

  // EVINA : viser 80 h — créneaux courts (sam 08h–17h45) si une vacation 12 h dépasserait
  for (const dateKey of datePriorityEvina()) {
    const st = states.get("EVINA");
    if (!st || st.h >= 80) break;
    const day = getDayOfWeek(parseDateKey(dateKey));
    const dayReqs = reqs.filter((r) => r.days.includes(day));
    const shortFirst = [...dayReqs].sort((a, b) => {
      const ha = calculateShiftHours(a.startTime, a.endTime);
      const hb = calculateShiftHours(b.startTime, b.endTime);
      return ha - hb;
    });
    for (const req of shortFirst) {
      if (tryAssign("EVINA", dateKey, req)) break;
    }
  }

  const extras = await prisma.agent.findMany({
    where: {
      lastName: { in: ["YAHMADI"], mode: "insensitive" },
      active: true,
    },
  });
  for (const ag of extras) {
    const ln = ag.lastName.toUpperCase();
    const existing = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, agentId: ag.id },
    });
    const cap = agentCaps(ln);
    states.set(ln, {
      id: ag.id,
      lastName: ln,
      h: existing.reduce((s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)), 0),
      cnt: existing.length,
      maxH: cap.maxH,
      maxS: cap.maxS,
      busyDates: new Set(existing.map((a) => toDateKey(a.date))),
    });
  }

  // Pass 2 : combler les postes vacants avec tout agent éligible
  for (const dateKey of OCT_DAYS) {
    const day = getDayOfWeek(parseDateKey(dateKey));
    for (const req of reqs) {
      if (!req.days.includes(day)) continue;
      const sk = slotKey(dateKey, req);
      while ((slotFilled.get(sk) ?? 0) < req.agentCount) {
        let placed = false;
        const pass2Order =
          req.role === PositionRole.TEAM_LEADER
            ? ["LAJIMI", ...fillOrder]
            : isNight(req.shiftType, req.startTime, req.endTime)
              ? ["CHARGUI", "DIAKITE", "YAHMADI"]
              : ["CHARGUI", "DORCE", "EVINA", "KIBRI", "DJEDIA", "DEMBELE", "SEITI", "HOUNGUES"];
        for (const ln of pass2Order) {
          if (tryAssign(ln, dateKey, req)) {
            placed = true;
            break;
          }
        }
        if (!placed) break;
      }
    }
  }

  for (const dateKey of OCT_DAYS) {
    const day = getDayOfWeek(parseDateKey(dateKey));
    for (const req of reqs) {
      if (!req.days.includes(day)) continue;
      if (!isNight(req.shiftType, req.startTime, req.endTime)) continue;
      const sk = slotKey(dateKey, req);
      while ((slotFilled.get(sk) ?? 0) < req.agentCount) {
        let placed = false;
        for (const ln of ["CHARGUI", "DIAKITE", "YAHMADI"]) {
          if (tryAssign(ln, dateKey, req)) {
            placed = true;
            break;
          }
        }
        if (!placed) break;
      }
    }
  }

  // Pass 3 : postes AGENT jour encore vides
  for (const dateKey of OCT_DAYS) {
    const day = getDayOfWeek(parseDateKey(dateKey));
    for (const req of reqs) {
      if (!req.days.includes(day)) continue;
      if (req.role !== PositionRole.AGENT) continue;
      if (isNight(req.shiftType, req.startTime, req.endTime)) continue;
      const sk = slotKey(dateKey, req);
      while ((slotFilled.get(sk) ?? 0) < req.agentCount) {
        let placed = false;
        for (const ln of ["CHARGUI", "DORCE", "EVINA", "KIBRI", "DJEDIA", "DEMBELE"]) {
          if (tryAssign(ln, dateKey, req)) {
            placed = true;
            break;
          }
        }
        if (!placed) break;
      }
    }
  }

  // DEMBELE : +2 vac jour (objectif 15)
  for (const dateKey of spreadDates(OCT_DAYS, 31)) {
    const st = states.get("DEMBELE");
    if (!st || st.cnt >= agentCaps("DEMBELE").maxS) break;
    const day = getDayOfWeek(parseDateKey(dateKey));
    for (const req of reqs.filter((r) => r.days.includes(day) && r.role === PositionRole.AGENT && !isNight(r.shiftType, r.startTime, r.endTime))) {
      if (tryAssign("DEMBELE", dateKey, req)) break;
    }
  }

  // CHARGUI : combler postes libérés (ex-AOUFI) — WE + joker semaine
  for (const dateKey of OCT_DAYS) {
    const st = states.get("CHARGUI");
    if (!st || st.cnt >= st.maxS || st.h >= st.maxH) break;
    const day = getDayOfWeek(parseDateKey(dateKey));
    const dayReqs = reqs.filter((r) => r.days.includes(day));
    const nightFirst = [...dayReqs].sort((a, b) => {
      const an = isNight(a.shiftType, a.startTime, a.endTime);
      const bn = isNight(b.shiftType, b.startTime, b.endTime);
      if (WEEKEND.has(day) && an && !bn) return -1;
      if (WEEKEND.has(day) && bn && !an) return 1;
      return 0;
    });
    for (const req of nightFirst) {
      if (tryAssign("CHARGUI", dateKey, req)) break;
    }
  }

  if (gemeauxAssignments.length > 0) {
    await prisma.assignment.createMany({ data: gemeauxAssignments.map((a) => ({ ...a, planningMonthId: pm.id, siteId: gemeaux.id })) });
    console.log(`✓ ${gemeauxAssignments.length} affectations Gémeaux créées`);
  }

  const cleaned = await enforceClientRulesOnGemeaux(pm.id, gemeaux.id, med?.id ?? null);
  if (cleaned > 0) console.log(`✓ ${cleaned} affectation(s) non conformes supprimées`);
  const extra = await refillGemeauxGaps(pm.id, gemeaux.id, pleyel.id, med?.id ?? null, reqs);
  if (extra > 0) console.log(`✓ ${extra} affectation(s) de comblement ajoutées`);

  const consec = await enforceMax3ConsecutiveWorkDays(pm.id, gemeaux.id);
  if (consec > 0) console.log(`✓ ${consec} vacation(s) retirées (max 3 jours à la filet)`);

  // Audit UI fill
  const created = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: gemeaux.id },
    include: { agent: true },
  });
  const dtos = created.map((a) => ({
    siteId: a.siteId,
    date: toDateKey(a.date),
    startTime: a.startTime,
    endTime: a.endTime,
    requirementId: a.requirementId,
    role: a.role,
  }));

  let total = 0;
  let filled = 0;
  for (const req of reqs) {
    for (const dateKey of OCT_DAYS) {
      if (!req.days.includes(getDayOfWeek(parseDateKey(dateKey)))) continue;
      for (let i = 0; i < req.agentCount; i++) {
        total++;
        const slot = {
          siteId: gemeaux.id,
          date: dateKey,
          startTime: req.startTime,
          endTime: req.endTime,
          requirementId: req.id,
          role: req.role ?? PositionRole.AGENT,
        };
        const matching = dtos.filter((a) => assignmentsMatchSlot(a, slot));
        if (matching[i]) filled++;
      }
    }
  }
  console.log(`\nPostes UI: ${filled}/${total} (${total - filled} vacants)`);

  console.log("\n--- Bilan agents (tous sites) ---");
  for (const ln of [...MANAGED, "YAHMADI"]) {
    const rows = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, agent: { lastName: { equals: ln, mode: "insensitive" } } },
      include: { site: true },
    });
    const h = rows.reduce((s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)), 0);
    const gemCnt = rows.filter((r) => r.siteId === gemeaux.id).length;
    console.log(`  ${ln.padEnd(10)} ${h.toFixed(1).padStart(6)} h  (${rows.length} vac, ${gemCnt} Gémeaux)`);
  }

  const diakite = created.filter((a) => a.agent.lastName.toUpperCase() === "DIAKITE");
  const after19 = diakite.filter((a) => toDateKey(a.date) >= "2026-10-19");
  console.log(`\nDIAKITE: ${diakite.length} vac, ${after19.length} à partir du 19/10`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
