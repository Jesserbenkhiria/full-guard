/**
 * Gémeaux oct. 2026 — réajustements v8 (Médiathèque non modifiée) :
 *  1. DIAKITE / CHARGUI : postes JOUR libérés (ils passent en nuit) pour KIBRI.
 *  2. Doublons (2 agents sur un poste ×1) relogés sur un poste libre équivalent.
 *  3. LAJIMI : jamais plus de 3 jours consécutifs (séries 05–08 et 12–15).
 *  4. KIBRI : jusqu'à 5 vacations jour, hors jours Médiathèque.
 *  5. EVINA : montée vers 80 h (vendredis en priorité).
 *
 * Run: npx tsx prisma/adjust-gemeaux-oct-v8.ts
 */
import { DayOfWeek, PositionRole, PrismaClient, ShiftType } from "@prisma/client";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

const OCT_DAYS = Array.from({ length: 31 }, (_, i) =>
  `2026-10-${String(i + 1).padStart(2, "0")}`
);

const MAX_CONSECUTIVE = 3;

const LAJIMI_DAYS = new Set<DayOfWeek>([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
]);
const DJEDIA_DAYS = LAJIMI_DAYS;
const FRI_SAT = new Set<DayOfWeek>([DayOfWeek.FRIDAY, DayOfWeek.SATURDAY]);

type Req = {
  id: string;
  days: DayOfWeek[];
  startTime: string;
  endTime: string;
  shiftType: ShiftType;
  role: PositionRole;
  agentCount: number;
};

type Row = {
  id: string;
  agentId: string;
  lastName: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  role: PositionRole;
  shiftType: ShiftType;
  hours: number;
  siteId: string;
};

function isNight(startTime: string, endTime: string) {
  return endTime < startTime;
}

function slotKey(dateKey: string, r: { startTime: string; endTime: string; role: PositionRole }) {
  return `${dateKey}|${r.startTime}|${r.endTime}|${r.role}`;
}

function runLengthOk(dates: Set<string>, added: string, removed?: string): boolean {
  const set = new Set(dates);
  if (removed) set.delete(removed);
  if (set.has(added)) return false;
  set.add(added);
  const sorted = [...set].sort();
  let run = 1;
  let max = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.round(
      (parseDateKey(sorted[i]!).getTime() - parseDateKey(sorted[i - 1]!).getTime()) / 86_400_000
    );
    if (diff === 1) {
      run++;
      max = Math.max(max, run);
    } else run = 1;
  }
  return max <= MAX_CONSECUTIVE;
}

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const gem = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const med = await prisma.site.findFirst({
    where: { OR: [{ name: { contains: "Horloge" } }, { name: { contains: "Médiath" } }] },
  });
  if (!pm || !gem) process.exit(1);

  const reqs: Req[] = (
    await prisma.siteRequirement.findMany({ where: { siteId: gem.id, active: true } })
  )
    .filter((r) => r.specificDate === null)
    .map((r) => ({
      id: r.id,
      days: r.days,
      startTime: r.startTime,
      endTime: r.endTime,
      shiftType: r.shiftType,
      role: r.role ?? PositionRole.AGENT,
      agentCount: r.agentCount,
    }));

  const allRaw = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id },
    include: { agent: true },
  });

  const rows: Row[] = allRaw.map((a) => ({
    id: a.id,
    agentId: a.agentId,
    lastName: a.agent.lastName.toUpperCase(),
    dateKey: toDateKey(a.date),
    startTime: a.startTime,
    endTime: a.endTime,
    role: a.role,
    shiftType: a.shiftType,
    hours: a.hours ?? calculateShiftHours(a.startTime, a.endTime),
    siteId: a.siteId,
  }));

  const gemRows = () => rows.filter((r) => r.siteId === gem.id);
  const busyDates = (agentId: string) =>
    new Set(rows.filter((r) => r.agentId === agentId).map((r) => r.dateKey));
  const medDates = (agentId: string) =>
    new Set(rows.filter((r) => r.agentId === agentId && r.siteId === med?.id).map((r) => r.dateKey));

  function occupancy() {
    const m = new Map<string, number>();
    for (const r of gemRows()) {
      const k = slotKey(r.dateKey, r);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }

  function agentAllows(ln: string, dateKey: string, req: Req): boolean {
    const day = getDayOfWeek(parseDateKey(dateKey));
    const night = isNight(req.startTime, req.endTime);
    if (!req.days.includes(day)) return false;

    switch (ln) {
      case "LAJIMI":
        return LAJIMI_DAYS.has(day) && !night && req.role === PositionRole.TEAM_LEADER;
      case "DJEDIA":
        return DJEDIA_DAYS.has(day) && !night && req.role === PositionRole.AGENT;
      case "DIAKITE":
        if (!night || req.role !== PositionRole.AGENT) return false;
        return !(dateKey >= "2026-10-19" && !FRI_SAT.has(day));
      case "DEMBELE":
      case "SEITI":
      case "HOUNGUES":
      case "KIBRI":
        return !night && req.role === PositionRole.AGENT;
      case "EVINA":
        return !night && req.role === PositionRole.AGENT;
      case "YAHMADI":
        return night && req.role === PositionRole.AGENT;
      case "CHARGUI":
        return true;
      default:
        return false;
    }
  }

  function canPlace(
    agentId: string,
    ln: string,
    dateKey: string,
    req: Req,
    occ: Map<string, number>,
    freeingDate?: string
  ): boolean {
    if (!agentAllows(ln, dateKey, req)) return false;
    const busy = busyDates(agentId);
    if (freeingDate) busy.delete(freeingDate);
    if (busy.has(dateKey)) return false;
    if (ln === "KIBRI" && medDates(agentId).has(dateKey)) return false;
    if ((occ.get(slotKey(dateKey, req)) ?? 0) >= req.agentCount) return false;
    return runLengthOk(busy, dateKey);
  }

  async function moveRow(row: Row, dateKey: string, req: Req, why: string) {
    const hours = calculateShiftHours(req.startTime, req.endTime);
    await prisma.assignment.update({
      where: { id: row.id },
      data: {
        date: parseDateKey(dateKey),
        requirementId: req.id,
        startTime: req.startTime,
        endTime: req.endTime,
        role: req.role,
        shiftType: req.shiftType,
        hours,
        notes: `v8 ${why}`,
      },
    });
    console.log(
      `  ↪ ${row.lastName}: ${row.dateKey} ${row.startTime}-${row.endTime} → ${dateKey} ${req.startTime}-${req.endTime} (${why})`
    );
    row.dateKey = dateKey;
    row.startTime = req.startTime;
    row.endTime = req.endTime;
    row.role = req.role;
    row.shiftType = req.shiftType;
    row.hours = hours;
  }

  async function addRow(agentId: string, ln: string, dateKey: string, req: Req, why: string) {
    const hours = calculateShiftHours(req.startTime, req.endTime);
    const created = await prisma.assignment.create({
      data: {
        planningMonthId: pm.id,
        agentId,
        siteId: gem.id,
        requirementId: req.id,
        date: parseDateKey(dateKey),
        shiftType: req.shiftType,
        role: req.role,
        startTime: req.startTime,
        endTime: req.endTime,
        hours,
        notes: `v8 ${why}`,
      },
    });
    rows.push({
      id: created.id,
      agentId,
      lastName: ln,
      dateKey,
      startTime: req.startTime,
      endTime: req.endTime,
      role: req.role,
      shiftType: req.shiftType,
      hours,
      siteId: gem.id,
    });
    console.log(`  + ${ln}: ${dateKey} ${req.startTime}-${req.endTime} (${why})`);
  }

  // ── 1. DIAKITE / CHARGUI : postes JOUR → NUIT ─────────────────────────────
  console.log("1. Libération de postes AGENT jour (DIAKITE / CHARGUI → nuit)");
  for (const ln of ["DIAKITE", "CHARGUI"]) {
    const dayRows = gemRows().filter(
      (r) => r.lastName === ln && r.role === PositionRole.AGENT && !isNight(r.startTime, r.endTime)
    );
    for (const row of dayRows) {
      const occ = occupancy();
      let done = false;
      for (const dateKey of OCT_DAYS) {
        for (const req of reqs.filter((r) => isNight(r.startTime, r.endTime))) {
          if (!canPlace(row.agentId, ln, dateKey, req, occ, row.dateKey)) continue;
          await moveRow(row, dateKey, req, "jour→nuit");
          done = true;
          break;
        }
        if (done) break;
      }
      if (!done) console.log(`  ! ${ln} ${row.dateKey}: aucune nuit libre`);
    }
  }

  // ── 2. Doublons : reloger l'excédent ──────────────────────────────────────
  console.log("\n2. Résolution des doublons (2 agents sur un poste ×1)");
  for (;;) {
    const occ = occupancy();
    let over: { key: string; req: Req; dateKey: string } | null = null;
    for (const dateKey of OCT_DAYS) {
      const day = getDayOfWeek(parseDateKey(dateKey));
      for (const req of reqs) {
        if (!req.days.includes(day)) continue;
        const k = slotKey(dateKey, req);
        if ((occ.get(k) ?? 0) > req.agentCount) {
          over = { key: k, req, dateKey };
          break;
        }
      }
      if (over) break;
    }
    if (!over) break;

    const onSlot = gemRows().filter(
      (r) =>
        r.dateKey === over!.dateKey &&
        r.startTime === over!.req.startTime &&
        r.endTime === over!.req.endTime &&
        r.role === over!.req.role
    );
    const victim = onSlot[onSlot.length - 1];
    if (!victim) break;

    let moved = false;
    const sameHours = reqs.filter(
      (r) => calculateShiftHours(r.startTime, r.endTime) === victim.hours
    );
    for (const pool of [sameHours, reqs]) {
      for (const dateKey of OCT_DAYS) {
        for (const req of pool) {
          if (!canPlace(victim.agentId, victim.lastName, dateKey, req, occ, victim.dateKey)) continue;
          await moveRow(victim, dateKey, req, "doublon");
          moved = true;
          break;
        }
        if (moved) break;
      }
      if (moved) break;
    }
    if (!moved) {
      console.log(`  ! ${victim.lastName} ${victim.dateKey}: aucun poste libre — supprimé`);
      await prisma.assignment.delete({ where: { id: victim.id } });
      rows.splice(rows.indexOf(victim), 1);
    }
  }

  // ── 3. LAJIMI : max 3 jours consécutifs ───────────────────────────────────
  console.log("\n3. LAJIMI — max 3 jours consécutifs");
  for (;;) {
    const lajimi = gemRows().filter((r) => r.lastName === "LAJIMI");
    const dates = [...new Set(lajimi.map((r) => r.dateKey))].sort();
    let breakAt: string | null = null;
    let run = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = Math.round(
        (parseDateKey(dates[i]!).getTime() - parseDateKey(dates[i - 1]!).getTime()) / 86_400_000
      );
      if (diff === 1) {
        run++;
        if (run > MAX_CONSECUTIVE) {
          breakAt = dates[i]!;
          break;
        }
      } else run = 1;
    }
    if (!breakAt) break;

    const row = lajimi.find((r) => r.dateKey === breakAt);
    if (!row) break;
    const occ = occupancy();
    let moved = false;
    for (const dateKey of OCT_DAYS) {
      for (const req of reqs.filter((r) => r.role === PositionRole.TEAM_LEADER)) {
        if (!canPlace(row.agentId, "LAJIMI", dateKey, req, occ, row.dateKey)) continue;
        await moveRow(row, dateKey, req, "max 3 j");
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) {
      console.log(`  ! LAJIMI ${breakAt}: aucun poste chef libre`);
      break;
    }
  }

  // ── 4. KIBRI : jusqu'à 5 vacations jour ───────────────────────────────────
  console.log("\n4. KIBRI — objectif 5 vacations / 60 h");
  const kibri = await prisma.agent.findFirst({ where: { lastName: "KIBRI" } });
  if (kibri) {
    for (let n = gemRows().filter((r) => r.lastName === "KIBRI").length; n < 5; ) {
      const occ = occupancy();
      let placed = false;
      const dayReqs = reqs
        .filter((r) => !isNight(r.startTime, r.endTime) && r.role === PositionRole.AGENT)
        .sort(
          (a, b) =>
            calculateShiftHours(b.startTime, b.endTime) - calculateShiftHours(a.startTime, a.endTime)
        );
      for (const dateKey of OCT_DAYS) {
        for (const req of dayReqs) {
          if (!canPlace(kibri.id, "KIBRI", dateKey, req, occ)) continue;
          await addRow(kibri.id, "KIBRI", dateKey, req, "KIBRI 60h");
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) break;
      n++;
    }
  }

  // ── 5. EVINA : vers 80 h (vendredis en priorité) ──────────────────────────
  console.log("\n5. EVINA — objectif 80 h");
  const evina = await prisma.agent.findFirst({ where: { lastName: "EVINA" } });
  if (evina) {
    for (;;) {
      const h = gemRows()
        .filter((r) => r.lastName === "EVINA")
        .reduce((s, r) => s + r.hours, 0);
      if (h >= 78) break;
      const occ = occupancy();
      const fridays = OCT_DAYS.filter((d) => getDayOfWeek(parseDateKey(d)) === DayOfWeek.FRIDAY);
      const others = OCT_DAYS.filter((d) => !fridays.includes(d));
      let placed = false;
      for (const dateKey of [...fridays, ...others]) {
        for (const req of reqs.filter(
          (r) => !isNight(r.startTime, r.endTime) && r.role === PositionRole.AGENT
        )) {
          if (!canPlace(evina.id, "EVINA", dateKey, req, occ)) continue;
          await addRow(evina.id, "EVINA", dateKey, req, "EVINA 80h");
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) break;
    }
  }

  // ── Bilan ─────────────────────────────────────────────────────────────────
  console.log("\n--- Bilan Gémeaux oct. 2026 ---");
  const byAgent = new Map<string, { n: number; h: number }>();
  for (const r of gemRows()) {
    const s = byAgent.get(r.lastName) ?? { n: 0, h: 0 };
    s.n++;
    s.h += r.hours;
    byAgent.set(r.lastName, s);
  }
  for (const [ln, s] of [...byAgent.entries()].sort((a, b) => b[1].h - a[1].h)) {
    console.log(`  ${ln.padEnd(10)} ${s.h.toFixed(1).padStart(6)} h  (${s.n} vac)`);
  }

  const lajimiDates = [...new Set(gemRows().filter((r) => r.lastName === "LAJIMI").map((r) => r.dateKey))].sort();
  console.log(`\nLAJIMI: ${lajimiDates.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
