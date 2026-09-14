/**
 * Ajustements Gémeaux oct. 2026 (sans toucher Médiathèque) :
 * - CHARGUI : diminuer
 * - DEMBELE / SEITI / DIAKITE : 156 h
 * - HOUNGUES : 120 h
 * - LAJIMI & DJEDIA : lun, mar, mer, jeu, sam (message Lajimi 14/09)
 *
 * Run: npx tsx prisma/adjust-gemeaux-oct-2026-simple.ts
 */
import {
  DayOfWeek,
  PositionRole,
  PrismaClient,
  ShiftType,
} from "@prisma/client";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

const OCT_DAYS = Array.from({ length: 31 }, (_, i) =>
  `2026-10-${String(i + 1).padStart(2, "0")}`
);

const LAJIMI_DAYS = new Set<DayOfWeek>([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
]);

const DJEDIA_DAYS = LAJIMI_DAYS;

const FRI_SAT = new Set<DayOfWeek>([DayOfWeek.FRIDAY, DayOfWeek.SATURDAY]);

function isNight(shiftType: ShiftType, startTime: string, endTime: string): boolean {
  return shiftType === ShiftType.NIGHT || endTime < startTime;
}

function shiftHours(a: { startTime: string; endTime: string; hours: number | null }) {
  return a.hours ?? calculateShiftHours(a.startTime, a.endTime);
}

async function trimGemeauxAgent(
  planningMonthId: string,
  gemeauxId: string,
  lastName: string,
  maxH: number,
  maxVac: number,
  filter?: (a: {
    role: PositionRole;
    date: Date;
    startTime: string;
    endTime: string;
    shiftType: ShiftType;
  }) => boolean
): Promise<number> {
  const ag = await prisma.agent.findFirst({
    where: { lastName: { equals: lastName, mode: "insensitive" } },
  });
  if (!ag) return 0;

  let deleted = 0;
  for (;;) {
    const rows = await prisma.assignment.findMany({
      where: { planningMonthId, siteId: gemeauxId, agentId: ag.id },
      orderBy: { date: "desc" },
    });
    const filtered = filter ? rows.filter(filter) : rows;
    const h = filtered.reduce((s, r) => s + shiftHours(r), 0);
    if (filtered.length <= maxVac && h <= maxH + 0.5) break;
    const victim = filtered[0];
    if (!victim) break;
    await prisma.assignment.delete({ where: { id: victim.id } });
    deleted++;
  }
  return deleted;
}

async function enforceDayRules(planningMonthId: string, gemeauxId: string, medId: string | null) {
  const rows = await prisma.assignment.findMany({
    where: { planningMonthId, siteId: gemeauxId },
    include: { agent: true },
  });
  const all = await prisma.assignment.findMany({ where: { planningMonthId } });
  const toDelete: string[] = [];

  for (const a of rows) {
    const ln = a.agent.lastName.toUpperCase();
    const day = getDayOfWeek(a.date);
    const dk = toDateKey(a.date);
    const night = isNight(a.shiftType, a.startTime, a.endTime);

    if (ln === "LAJIMI") {
      if (!LAJIMI_DAYS.has(day) || night || a.role !== PositionRole.TEAM_LEADER) toDelete.push(a.id);
    }
    if (ln === "DJEDIA") {
      if (!DJEDIA_DAYS.has(day) || night || a.role !== PositionRole.AGENT) toDelete.push(a.id);
    }
    if (ln === "KIBRI" && medId) {
      const onMed = all.some(
        (x) => x.agentId === a.agentId && x.siteId === medId && toDateKey(x.date) === dk
      );
      if (onMed) toDelete.push(a.id);
    }
  }

  const ids = [...new Set(toDelete)];
  if (ids.length) await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

async function topUpToHours(
  planningMonthId: string,
  gemeauxId: string,
  pleyelId: string,
  medId: string | null,
  lastName: string,
  targetH: number,
  maxVac: number
): Promise<number> {
  const ag = await prisma.agent.findFirst({
    where: { lastName: { equals: lastName, mode: "insensitive" } },
  });
  if (!ag) return 0;

  const allReqs = await prisma.siteRequirement.findMany({
    where: { siteId: gemeauxId, active: true },
  });
  const reqs = allReqs.filter((r) => r.specificDate === null);

  const allRows = await prisma.assignment.findMany({ where: { planningMonthId } });
  const gemRows = allRows.filter((r) => r.siteId === gemeauxId);
  const slotFilled = new Map<string, number>();
  for (const a of gemRows) {
    const sk = `${toDateKey(a.date)}|${a.startTime}|${a.endTime}|${a.role}`;
    slotFilled.set(sk, (slotFilled.get(sk) ?? 0) + 1);
  }

  const busy = new Set(
    allRows.filter((r) => r.agentId === ag.id).map((r) => toDateKey(r.date))
  );
  if (medId) {
    for (const r of allRows.filter((x) => x.agentId === ag.id && x.siteId === medId)) {
      busy.add(toDateKey(r.date));
    }
  }
  const pleyelBusy = new Set(
    allRows.filter((x) => x.agentId === ag.id && x.siteId === pleyelId).map((x) => toDateKey(x.date))
  );

  let h = allRows
    .filter((r) => r.agentId === ag.id && r.siteId === gemeauxId)
    .reduce((s, r) => s + shiftHours(r), 0);
  let cnt = allRows.filter((r) => r.agentId === ag.id && r.siteId === gemeauxId).length;

  const pending: {
    planningMonthId: string;
    agentId: string;
    siteId: string;
    requirementId: string;
    date: Date;
    shiftType: ShiftType;
    role: PositionRole;
    startTime: string;
    endTime: string;
    hours: number;
    notes: string;
  }[] = [];

  const ln = lastName.toUpperCase();
  for (const dateKey of OCT_DAYS) {
    if (h >= targetH - 0.5 || cnt >= maxVac) break;
    if (busy.has(dateKey)) continue;
    if (pleyelBusy.has(dateKey) && ln === "DORCE") continue;

    const day = getDayOfWeek(parseDateKey(dateKey));
    if (ln === "LAJIMI" && !LAJIMI_DAYS.has(day)) continue;
    if (ln === "DJEDIA" && !DJEDIA_DAYS.has(day)) continue;
    if (ln === "DIAKITE") {
      if (dateKey >= "2026-10-19" && !FRI_SAT.has(day)) continue;
    }

    for (const req of reqs) {
      if (!req.days.includes(day)) continue;
      const night = isNight(req.shiftType, req.startTime, req.endTime);
      if (ln === "DEMBELE" || ln === "SEITI" || ln === "HOUNGUES" || ln === "DJEDIA") {
        if (night || req.role !== PositionRole.AGENT) continue;
      }
      if (ln === "LAJIMI" && (night || req.role !== PositionRole.TEAM_LEADER)) continue;
      if (ln === "DIAKITE" && !night) continue;

      const sk = `${dateKey}|${req.startTime}|${req.endTime}|${req.role ?? PositionRole.AGENT}`;
      if ((slotFilled.get(sk) ?? 0) >= req.agentCount) continue;

      const sh = calculateShiftHours(req.startTime, req.endTime);
      if (h + sh > targetH + 2 && ln !== "DJEDIA") continue;

      pending.push({
        planningMonthId,
        agentId: ag.id,
        siteId: gemeauxId,
        requirementId: req.id,
        date: parseDateKey(dateKey),
        shiftType: req.shiftType,
        role: req.role ?? PositionRole.AGENT,
        startTime: req.startTime,
        endTime: req.endTime,
        hours: sh,
        notes: `adjust-simple ${ln}`,
      });
      h += sh;
      cnt++;
      busy.add(dateKey);
      slotFilled.set(sk, (slotFilled.get(sk) ?? 0) + 1);
      break;
    }
  }

  if (!pending.length) return 0;
  await prisma.assignment.createMany({ data: pending });
  return pending.length;
}

/** Remplace un créneau court par 07–19 si l’agent est déjà à 13 vac mais < 156 h. */
async function upgradeShiftsTo156(
  planningMonthId: string,
  gemeauxId: string,
  pleyelId: string,
  medId: string | null,
  lastName: string
): Promise<number> {
  const ag = await prisma.agent.findFirst({
    where: { lastName: { equals: lastName, mode: "insensitive" } },
  });
  if (!ag) return 0;

  const rows = await prisma.assignment.findMany({
    where: { planningMonthId, siteId: gemeauxId, agentId: ag.id },
  });
  let h = rows.reduce((s, r) => s + shiftHours(r), 0);
  if (h >= 155.5 || rows.length === 0) return 0;

  let upgraded = 0;
  while (h < 155.5) {
  const short = [...rows].sort((a, b) => shiftHours(a) - shiftHours(b)).find((r) => shiftHours(r) < 12);
  if (!short) break;

  const allReqs = await prisma.siteRequirement.findMany({
    where: { siteId: gemeauxId, active: true },
  });
  const reqs = allReqs.filter((r) => r.specificDate === null);
  const day = getDayOfWeek(short.date);
  const longReq = reqs.find(
    (r) =>
      r.days.includes(day) &&
      r.role === PositionRole.AGENT &&
      r.startTime === "07:00" &&
      r.endTime === "19:00" &&
      !isNight(r.shiftType, r.startTime, r.endTime)
  );
  if (!longReq) break;

  const dateKey = toDateKey(short.date);
  const gemRows = await prisma.assignment.findMany({
    where: { planningMonthId, siteId: gemeauxId },
  });
  const sk = `${dateKey}|${longReq.startTime}|${longReq.endTime}|${longReq.role}`;
  const filled = gemRows.filter(
    (a) =>
      toDateKey(a.date) === dateKey &&
      a.startTime === longReq.startTime &&
      a.endTime === longReq.endTime &&
      a.role === longReq.role
  ).length;
  if (filled >= longReq.agentCount) break;

  await prisma.assignment.delete({ where: { id: short.id } });
  const sh = calculateShiftHours(longReq.startTime, longReq.endTime);
  await prisma.assignment.create({
    data: {
      planningMonthId,
      agentId: ag.id,
      siteId: gemeauxId,
      requirementId: longReq.id,
      date: short.date,
      shiftType: longReq.shiftType,
      role: longReq.role ?? PositionRole.AGENT,
      startTime: longReq.startTime,
      endTime: longReq.endTime,
      hours: sh,
      notes: `adjust-simple upgrade ${lastName}`,
    },
  });
  h = h - shiftHours(short) + sh;
  upgraded++;
  rows.splice(
    rows.findIndex((r) => r.id === short.id),
    1
  );
  rows.push({
    ...short,
    startTime: longReq.startTime,
    endTime: longReq.endTime,
    hours: sh,
  });
  }
  return upgraded;
}

/** Créneau samedi 08–17h45 → 07–19 un jour de semaine libre (même nb de vac). */
async function relocateShortDayShifts(
  planningMonthId: string,
  gemeauxId: string,
  pleyelId: string,
  medId: string | null,
  lastName: string
): Promise<number> {
  const ag = await prisma.agent.findFirst({
    where: { lastName: { equals: lastName, mode: "insensitive" } },
  });
  if (!ag) return 0;

  const allReqs = await prisma.siteRequirement.findMany({
    where: { siteId: gemeauxId, active: true },
  });
  const reqs = allReqs.filter((r) => r.specificDate === null);
  const weekdayReq = reqs.find(
    (r) =>
      r.startTime === "07:00" &&
      r.endTime === "19:00" &&
      r.role === PositionRole.AGENT &&
      !isNight(r.shiftType, r.startTime, r.endTime)
  );
  if (!weekdayReq) return 0;

  let moved = 0;
  for (;;) {
    const rows = await prisma.assignment.findMany({
      where: { planningMonthId, siteId: gemeauxId, agentId: ag.id },
    });
    const h = rows.reduce((s, r) => s + shiftHours(r), 0);
    if (h >= 155.5) break;
    const short = rows.find((r) => shiftHours(r) < 12);
    if (!short) break;

    const allRows = await prisma.assignment.findMany({ where: { planningMonthId } });
    const busy = new Set(allRows.filter((r) => r.agentId === ag.id).map((r) => toDateKey(r.date)));
    const pleyelBusy = new Set(
      allRows.filter((x) => x.agentId === ag.id && x.siteId === pleyelId).map((x) => toDateKey(x.date))
    );

    let targetDate: string | null = null;
    for (const dateKey of OCT_DAYS) {
      if (busy.has(dateKey)) continue;
      if (pleyelBusy.has(dateKey)) continue;
      const day = getDayOfWeek(parseDateKey(dateKey));
      if (!weekdayReq.days.includes(day)) continue;
      const sk = `${dateKey}|${weekdayReq.startTime}|${weekdayReq.endTime}|${weekdayReq.role}`;
      const filled = allRows.filter(
        (a) =>
          a.siteId === gemeauxId &&
          toDateKey(a.date) === dateKey &&
          a.startTime === weekdayReq.startTime &&
          a.endTime === weekdayReq.endTime &&
          a.role === weekdayReq.role
      ).length;
      if (filled >= weekdayReq.agentCount) continue;
      targetDate = dateKey;
      break;
    }
    if (!targetDate) break;

    await prisma.assignment.delete({ where: { id: short.id } });
    const sh = calculateShiftHours(weekdayReq.startTime, weekdayReq.endTime);
    await prisma.assignment.create({
      data: {
        planningMonthId,
        agentId: ag.id,
        siteId: gemeauxId,
        requirementId: weekdayReq.id,
        date: parseDateKey(targetDate),
        shiftType: weekdayReq.shiftType,
        role: weekdayReq.role ?? PositionRole.AGENT,
        startTime: weekdayReq.startTime,
        endTime: weekdayReq.endTime,
        hours: sh,
        notes: `adjust-simple relocate ${lastName}`,
      },
    });
    moved++;
  }
  return moved;
}

async function report(gemeauxId: string, planningMonthId: string) {
  console.log("\n--- Bilan Gémeaux ---");
  for (const ln of ["CHARGUI", "DEMBELE", "SEITI", "HOUNGUES", "DIAKITE", "LAJIMI", "DJEDIA"]) {
    const ag = await prisma.agent.findFirst({ where: { lastName: ln } });
    if (!ag) continue;
    const rows = await prisma.assignment.findMany({
      where: { planningMonthId, siteId: gemeauxId, agentId: ag.id },
    });
    const h = rows.reduce((s, r) => s + shiftHours(r), 0);
    console.log(`  ${ln.padEnd(10)} ${h.toFixed(1).padStart(6)} h  (${rows.length} vac)`);
  }
}

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const gemeaux = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const pleyel = await prisma.site.findFirst({ where: { name: "PLEYEL" } });
  const med = await prisma.site.findFirst({
    where: { OR: [{ name: { contains: "Horloge" } }, { name: { contains: "Médiath" } }] },
  });
  if (!pm || !gemeaux || !pleyel) process.exit(1);

  const n1 = await enforceDayRules(pm.id, gemeaux.id, med?.id ?? null);
  if (n1) console.log(`✓ ${n1} affectation(s) hors lun–jeu–sam (LAJIMI/DJEDIA) retirées`);

  const nCh = await trimGemeauxAgent(pm.id, gemeaux.id, "CHARGUI", 96, 8);
  if (nCh) console.log(`✓ CHARGUI : ${nCh} vacation(s) retirées (objectif ≤96 h)`);

  const nLj = await trimGemeauxAgent(
    pm.id,
    gemeaux.id,
    "LAJIMI",
    156,
    13,
    (a) => a.role === PositionRole.TEAM_LEADER
  );
  if (nLj) console.log(`✓ LAJIMI : ${nLj} chef(s) retirés (objectif 156 h / 13 vac)`);

  for (const ln of ["DEMBELE", "SEITI", "DJEDIA"] as const) {
    const added = await topUpToHours(pm.id, gemeaux.id, pleyel.id, med?.id ?? null, ln, 156, 13);
    if (added) console.log(`✓ ${ln} : +${added} vacation(s) (→ 156 h)`);
  }

  for (const ln of ["DEMBELE", "SEITI", "DJEDIA"] as const) {
    let swapped = await upgradeShiftsTo156(pm.id, gemeaux.id, pleyel.id, med?.id ?? null, ln);
    swapped += await relocateShortDayShifts(pm.id, gemeaux.id, pleyel.id, med?.id ?? null, ln);
    if (swapped) console.log(`✓ ${ln} : ${swapped} créneau(x) 07h–19h (→ 156 h)`);
  }

  for (const ln of ["SEITI", "DJEDIA"] as const) {
    const ag = await prisma.agent.findFirst({
      where: { lastName: { equals: ln, mode: "insensitive" } },
    });
    if (!ag) continue;
    let rows = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, siteId: gemeaux.id, agentId: ag.id },
    });
    let h = rows.reduce((s, r) => s + shiftHours(r), 0);
    const short = rows.find((r) => shiftHours(r) < 12);
    if (short && h < 155.5) {
      await prisma.assignment.delete({ where: { id: short.id } });
      const added = await topUpToHours(pm.id, gemeaux.id, pleyel.id, med?.id ?? null, ln, 156, 14);
      if (added) console.log(`✓ ${ln} : créneau court → 07h–19h (+${added} vac, → 156 h)`);
    }
  }

  const nH = await trimGemeauxAgent(pm.id, gemeaux.id, "HOUNGUES", 120, 10);
  if (nH) console.log(`✓ HOUNGUES : ${nH} vacation(s) retirées (plafond 120 h)`);
  const addH = await topUpToHours(pm.id, gemeaux.id, pleyel.id, med?.id ?? null, "HOUNGUES", 120, 10);
  if (addH) console.log(`✓ HOUNGUES : +${addH} vacation(s)`);

  const nDia = await trimGemeauxAgent(
    pm.id,
    gemeaux.id,
    "DIAKITE",
    156,
    13,
    (a) => isNight(a.shiftType, a.startTime, a.endTime)
  );
  if (nDia) console.log(`✓ DIAKITE : ${nDia} nuit(s) retirées (plafond 156 h)`);
  const addDia = await topUpToHours(pm.id, gemeaux.id, pleyel.id, med?.id ?? null, "DIAKITE", 156, 13);
  if (addDia) console.log(`✓ DIAKITE : +${addDia} nuit(s)`);

  await report(gemeaux.id, pm.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
