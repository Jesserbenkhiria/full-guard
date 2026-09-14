/**
 * Gémeaux oct. 2026 — réajustements v9 (Médiathèque non modifiée).
 *
 *  1. Doublons (2 agents sur un poste ×1) relogés — jamais supprimés.
 *  2. Volumes validés restaurés : DEMBELE/SEITI/DJEDIA/DIAKITE 156 h, HOUNGUES 120 h.
 *  3. KIBRI : jusqu'à 5 vacations jour, hors jours Médiathèque.
 *  4. Max 3 jours consécutifs pour tous (contrôle local, pas global).
 *  5. EVINA : vers 80 h, vendredis en priorité.
 *
 * Run: npx tsx prisma/adjust-gemeaux-oct-v9.ts
 */
import { DayOfWeek, PositionRole, PrismaClient, ShiftType } from "@prisma/client";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

const OCT_DAYS = Array.from({ length: 31 }, (_, i) =>
  `2026-10-${String(i + 1).padStart(2, "0")}`
);

const MAX_CONSECUTIVE = 3;
const DAY_MS = 86_400_000;

const LAJIMI_DAYS = new Set<DayOfWeek>([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
]);
const DJEDIA_DAYS = LAJIMI_DAYS;
const FRI_SAT = new Set<DayOfWeek>([DayOfWeek.FRIDAY, DayOfWeek.SATURDAY]);

/** Objectifs heures validés par le client. */
const TARGET_HOURS: Record<string, number> = {
  DEMBELE: 156,
  SEITI: 156,
  DJEDIA: 156,
  DIAKITE: 156,
  LAJIMI: 156,
  HOUNGUES: 120,
};

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

const isNight = (s: string, e: string) => e < s;
const hoursOf = (r: { startTime: string; endTime: string }) =>
  calculateShiftHours(r.startTime, r.endTime);
const slotKey = (d: string, r: { startTime: string; endTime: string; role: PositionRole }) =>
  `${d}|${r.startTime}|${r.endTime}|${r.role}`;

/** Longueur de la série consécutive passant par `dateKey`. */
function localRunLength(busy: Set<string>, dateKey: string): number {
  const t = parseDateKey(dateKey).getTime();
  let len = 1;
  for (let i = 1; ; i++) {
    if (!busy.has(toDateKey(new Date(t - i * DAY_MS)))) break;
    len++;
  }
  for (let i = 1; ; i++) {
    if (!busy.has(toDateKey(new Date(t + i * DAY_MS)))) break;
    len++;
  }
  return len;
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

  const rows: Row[] = (
    await prisma.assignment.findMany({
      where: { planningMonthId: pm.id },
      include: { agent: true },
    })
  ).map((a) => ({
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
  const busyOf = (agentId: string) =>
    new Set(rows.filter((r) => r.agentId === agentId).map((r) => r.dateKey));
  const medOf = (agentId: string) =>
    new Set(
      rows.filter((r) => r.agentId === agentId && r.siteId === med?.id).map((r) => r.dateKey)
    );
  const hoursGem = (ln: string) =>
    gemRows().filter((r) => r.lastName === ln).reduce((s, r) => s + r.hours, 0);

  function occupancy() {
    const m = new Map<string, number>();
    for (const r of gemRows()) m.set(slotKey(r.dateKey, r), (m.get(slotKey(r.dateKey, r)) ?? 0) + 1);
    return m;
  }

  function agentAllows(ln: string, dateKey: string, req: Req): boolean {
    const day = getDayOfWeek(parseDateKey(dateKey));
    if (!req.days.includes(day)) return false;
    const night = isNight(req.startTime, req.endTime);

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
    freeing?: string
  ): boolean {
    if (!agentAllows(ln, dateKey, req)) return false;
    const busy = busyOf(agentId);
    if (freeing) busy.delete(freeing);
    if (busy.has(dateKey)) return false;
    if (ln === "KIBRI" && medOf(agentId).has(dateKey)) return false;
    if ((occ.get(slotKey(dateKey, req)) ?? 0) >= req.agentCount) return false;
    busy.add(dateKey);
    return localRunLength(busy, dateKey) <= MAX_CONSECUTIVE;
  }

  async function moveRow(row: Row, dateKey: string, req: Req, why: string) {
    const h = hoursOf(req);
    await prisma.assignment.update({
      where: { id: row.id },
      data: {
        date: parseDateKey(dateKey),
        requirementId: req.id,
        startTime: req.startTime,
        endTime: req.endTime,
        role: req.role,
        shiftType: req.shiftType,
        hours: h,
        notes: `v9 ${why}`,
      },
    });
    console.log(
      `  ↪ ${row.lastName}: ${row.dateKey} ${row.startTime}-${row.endTime} → ${dateKey} ${req.startTime}-${req.endTime} (${why})`
    );
    Object.assign(row, {
      dateKey,
      startTime: req.startTime,
      endTime: req.endTime,
      role: req.role,
      shiftType: req.shiftType,
      hours: h,
    });
  }

  async function addRow(agentId: string, ln: string, dateKey: string, req: Req, why: string) {
    const h = hoursOf(req);
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
        hours: h,
        notes: `v9 ${why}`,
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
      hours: h,
      siteId: gem.id,
    });
    console.log(`  + ${ln}: ${dateKey} ${req.startTime}-${req.endTime} (${why})`);
  }

  /** Cherche un poste libre pour l'agent, en priorisant une durée donnée. */
  function findSlot(
    agentId: string,
    ln: string,
    occ: Map<string, number>,
    opts: { preferHours?: number; dates?: string[]; freeing?: string; roleFilter?: PositionRole }
  ): { dateKey: string; req: Req } | null {
    const dates = opts.dates ?? OCT_DAYS;
    const pools = opts.preferHours
      ? [reqs.filter((r) => hoursOf(r) === opts.preferHours), reqs]
      : [reqs];
    for (const pool of pools) {
      for (const dateKey of dates) {
        for (const req of pool) {
          if (opts.roleFilter && req.role !== opts.roleFilter) continue;
          if (!canPlace(agentId, ln, dateKey, req, occ, opts.freeing)) continue;
          return { dateKey, req };
        }
      }
    }
    return null;
  }

  // ── 1. Doublons ───────────────────────────────────────────────────────────
  console.log("1. Doublons (2 agents sur un poste ×1)");
  let guard = 0;
  for (; guard < 50; guard++) {
    const occ = occupancy();
    let over: { req: Req; dateKey: string } | null = null;
    for (const dateKey of OCT_DAYS) {
      const day = getDayOfWeek(parseDateKey(dateKey));
      for (const req of reqs) {
        if (!req.days.includes(day)) continue;
        if ((occ.get(slotKey(dateKey, req)) ?? 0) > req.agentCount) {
          over = { req, dateKey };
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
    const occ2 = occupancy();
    const found = findSlot(victim.agentId, victim.lastName, occ2, {
      preferHours: victim.hours,
      freeing: victim.dateKey,
    });
    if (found) await moveRow(victim, found.dateKey, found.req, "doublon");
    else {
      console.log(`  ! ${victim.lastName} ${victim.dateKey}: aucun poste libre (conservé en surplus)`);
      break;
    }
  }

  // ── 2. Max 3 jours consécutifs ────────────────────────────────────────────
  console.log("\n2. Max 3 jours consécutifs");
  for (guard = 0; guard < 60; guard++) {
    let fixedOne = false;
    const agentIds = [...new Set(gemRows().map((r) => r.agentId))];
    for (const agentId of agentIds) {
      const busy = busyOf(agentId);
      const dates = [...busy].sort();
      let offender: string | null = null;
      for (const d of dates) {
        if (localRunLength(busy, d) > MAX_CONSECUTIVE) offender = d;
      }
      if (!offender) continue;
      const row = gemRows().find((r) => r.agentId === agentId && r.dateKey === offender);
      if (!row) continue;
      const occ = occupancy();
      const found = findSlot(agentId, row.lastName, occ, {
        preferHours: row.hours,
        freeing: row.dateKey,
        roleFilter: row.role,
      });
      if (found) {
        await moveRow(row, found.dateKey, found.req, "max 3 j");
        fixedOne = true;
        break;
      }
      console.log(`  ! ${row.lastName} ${offender}: aucun poste libre pour casser la série`);
    }
    if (!fixedOne) break;
  }

  // ── 3. Restauration des volumes validés ───────────────────────────────────
  console.log("\n3. Volumes validés");
  for (const [ln, target] of Object.entries(TARGET_HOURS)) {
    const ag = await prisma.agent.findFirst({
      where: { lastName: { equals: ln, mode: "insensitive" } },
    });
    if (!ag) continue;
    for (guard = 0; guard < 10; guard++) {
      const h = hoursGem(ln);
      if (h >= target - 0.5) break;
      const occ = occupancy();
      const found = findSlot(ag.id, ln, occ, { preferHours: target - h >= 12 ? 12 : undefined });
      if (!found) {
        console.log(`  ! ${ln}: ${h.toFixed(1)} h / ${target} h — aucun poste libre`);
        break;
      }
      await addRow(ag.id, ln, found.dateKey, found.req, `${ln} ${target}h`);
    }
  }

  // ── 4. KIBRI ──────────────────────────────────────────────────────────────
  console.log("\n4. KIBRI — 5 vacations / 60 h");
  const kibri = await prisma.agent.findFirst({ where: { lastName: "KIBRI" } });
  if (kibri) {
    for (guard = 0; guard < 10; guard++) {
      const n = gemRows().filter((r) => r.lastName === "KIBRI").length;
      if (n >= 5) break;
      const occ = occupancy();
      const found = findSlot(kibri.id, "KIBRI", occ, {
        preferHours: 12,
        roleFilter: PositionRole.AGENT,
      });
      if (!found) {
        console.log(`  ! KIBRI: ${n}/5 vacations — plus aucun poste AGENT jour libre`);
        break;
      }
      await addRow(kibri.id, "KIBRI", found.dateKey, found.req, "KIBRI 60h");
    }
  }

  // ── 5. EVINA vers 80 h ────────────────────────────────────────────────────
  console.log("\n5. EVINA — 80 h (vendredis en priorité)");
  const evina = await prisma.agent.findFirst({ where: { lastName: "EVINA" } });
  if (evina) {
    // retirer l'excédent au-delà de ~82 h
    for (guard = 0; guard < 5; guard++) {
      const list = gemRows().filter((r) => r.lastName === "EVINA");
      const h = list.reduce((s, r) => s + r.hours, 0);
      if (h <= 82) break;
      const smallest = [...list].sort((a, b) => a.hours - b.hours)[0];
      if (!smallest) break;
      await prisma.assignment.delete({ where: { id: smallest.id } });
      rows.splice(rows.indexOf(smallest), 1);
      console.log(`  − EVINA: ${smallest.dateKey} retirée (${h.toFixed(1)} h → cible 80 h)`);
    }
    const fridays = OCT_DAYS.filter((d) => getDayOfWeek(parseDateKey(d)) === DayOfWeek.FRIDAY);
    for (guard = 0; guard < 6; guard++) {
      const h = hoursGem("EVINA");
      if (h >= 76) break;
      const occ = occupancy();
      const found =
        findSlot(evina.id, "EVINA", occ, { preferHours: 12, dates: fridays }) ??
        findSlot(evina.id, "EVINA", occ, { preferHours: 12 });
      if (!found) {
        console.log(`  ! EVINA: ${h.toFixed(1)} h — plus aucun poste jour libre`);
        break;
      }
      await addRow(evina.id, "EVINA", found.dateKey, found.req, "EVINA 80h");
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
    const t = TARGET_HOURS[ln];
    const flag = t ? (Math.abs(s.h - t) < 0.5 ? "✓" : `≠ ${t}h`) : "";
    console.log(`  ${ln.padEnd(10)} ${s.h.toFixed(1).padStart(6)} h  (${s.n} vac) ${flag}`);
  }

  for (const ln of ["LAJIMI", "DJEDIA", "KIBRI", "EVINA"]) {
    const d = [...new Set(gemRows().filter((r) => r.lastName === ln).map((r) => r.dateKey))].sort();
    console.log(`\n${ln}: ${d.join(", ") || "—"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
