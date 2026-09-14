/**
 * Recopie les affectations Gémeaux du mois source vers le mois cible
 * (même créneau horaire + rôle + agent, AOUFI→CHARGUI, HALIDI ignoré).
 *
 * Par défaut : même **occurrence de jour de semaine** (ex. 1er vendredi sep → 1er vendredi oct).
 * Option `--calendar` : jour du mois 1:1 (05/09 → 05/10).
 *
 * Run: npx tsx prisma/copy-gemeaux-from-previous-month.ts 2026 9 10
 */
import { PositionRole, PrismaClient } from "@prisma/client";
import { getDay } from "date-fns";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

const AGENT_REMAP: Record<string, string> = {
  AOUFI: "CHARGUI",
  HALIDI: "",
};

/** 1 = first Monday/Tuesday/… in that month. */
function weekdayOccurrence(dateKey: string): number {
  const d = parseDateKey(dateKey);
  const jsDow = getDay(d);
  let n = 0;
  for (let day = 1; day <= d.getDate(); day++) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (getDay(parseDateKey(k)) === jsDow) n++;
  }
  return n;
}

function nthWeekdayInMonth(year: number, month: number, jsDow: number, occurrence: number): string | null {
  let n = 0;
  for (let day = 1; day <= 31; day++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dt = parseDateKey(key);
    if (dt.getMonth() !== month - 1) break;
    if (getDay(dt) === jsDow) {
      n++;
      if (n === occurrence) return key;
    }
  }
  return null;
}

function lastWeekdayInMonth(year: number, month: number, jsDow: number): string | null {
  let last: string | null = null;
  for (let day = 1; day <= 31; day++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dt = parseDateKey(key);
    if (dt.getMonth() !== month - 1) break;
    if (getDay(dt) === jsDow) last = key;
  }
  return last;
}

function mapSourceDateToTarget(
  srcDateKey: string,
  year: number,
  dstMonth: number,
  mode: "weekday" | "calendar"
): string | null {
  if (mode === "calendar") {
    const day = Number(srcDateKey.slice(8, 10));
    if (dstMonth === 2 && day > 28) return null;
    return `${year}-${String(dstMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const jsDow = getDay(parseDateKey(srcDateKey));
  const occ = weekdayOccurrence(srcDateKey);
  return (
    nthWeekdayInMonth(year, dstMonth, jsDow, occ) ??
    lastWeekdayInMonth(year, dstMonth, jsDow)
  );
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const calendarMode = process.argv.includes("--calendar");
  const year = Number(args[0] ?? 2026);
  const srcMonth = Number(args[1] ?? 9);
  const dstMonth = Number(args[2] ?? 10);
  const mapMode = calendarMode ? "calendar" : "weekday";

  const [srcPm, dstPm] = await Promise.all([
    prisma.planningMonth.findFirst({ where: { year, month: srcMonth } }),
    prisma.planningMonth.findFirst({ where: { year, month: dstMonth } }),
  ]);
  if (!srcPm || !dstPm) {
    console.error("Planning month introuvable");
    process.exit(1);
  }

  const gemeaux = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const med = await prisma.site.findFirst({
    where: { OR: [{ name: { contains: "Horloge" } }, { name: { contains: "Médiath" } }] },
  });
  const pleyel = await prisma.site.findFirst({ where: { name: "PLEYEL" } });
  if (!gemeaux) process.exit(1);

  const srcRows = await prisma.assignment.findMany({
    where: { planningMonthId: srcPm.id, siteId: gemeaux.id },
    include: { agent: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }, { role: "asc" }],
  });

  const del = await prisma.assignment.deleteMany({
    where: { planningMonthId: dstPm.id, siteId: gemeaux.id },
  });
  console.log(`✓ ${dstMonth}/${year} Gémeaux: ${del.count} affectations supprimées (${mapMode})`);

  const reqs = await prisma.siteRequirement.findMany({
    where: { siteId: gemeaux.id, active: true },
  });
  const recurring = reqs.filter((r) => r.specificDate === null);

  function findReq(dateKey: string, a: (typeof srcRows)[0]) {
    const day = getDayOfWeek(parseDateKey(dateKey));
    const exact = recurring.find(
      (r) =>
        r.startTime === a.startTime &&
        r.endTime === a.endTime &&
        (r.role ?? PositionRole.AGENT) === a.role &&
        r.shiftType === a.shiftType &&
        r.days.includes(day)
    );
    if (exact) return exact;
    return recurring.find(
      (r) =>
        r.startTime === a.startTime &&
        r.endTime === a.endTime &&
        (r.role ?? PositionRole.AGENT) === a.role &&
        r.shiftType === a.shiftType
    );
  }

  const agents = await prisma.agent.findMany({ where: { active: true } });
  const agentByLn = new Map(agents.map((a) => [a.lastName.toUpperCase(), a]));

  const dstExisting = await prisma.assignment.findMany({
    where: { planningMonthId: dstPm.id },
  });
  /** Même agent peut avoir jour + nuit le même jour (comme en septembre). */
  const busyByAgentShift = new Set(
    dstExisting.map(
      (a) => `${a.agentId}|${toDateKey(a.date)}|${a.startTime}|${a.endTime}|${a.role}`
    )
  );

  const medByAgentDate = new Set<string>();
  if (med) {
    for (const a of dstExisting.filter((x) => x.siteId === med.id)) {
      medByAgentDate.add(`${a.agentId}|${toDateKey(a.date)}`);
    }
  }
  const pleyelByAgentDate = new Set<string>();
  if (pleyel) {
    for (const a of dstExisting.filter((x) => x.siteId === pleyel.id)) {
      pleyelByAgentDate.add(`${a.agentId}|${toDateKey(a.date)}`);
    }
  }

  const slotFilled = new Map<string, number>();
  for (const a of dstExisting.filter((x) => x.siteId === gemeaux.id)) {
    const k = `${toDateKey(a.date)}|${a.startTime}|${a.endTime}|${a.role}`;
    slotFilled.set(k, (slotFilled.get(k) ?? 0) + 1);
  }

  let created = 0;
  let skipped = 0;
  const skipReasons = new Map<string, number>();

  function skip(reason: string) {
    skipped++;
    skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
  }

  async function tryCreate(
    a: (typeof srcRows)[0],
    dstDateKey: string,
    ln: string
  ): Promise<"ok" | string> {
    const agent = agentByLn.get(ln);
    if (!agent) return "unknown-agent";

    const req = findReq(dstDateKey, a);
    if (!req) return "no-requirement";

    const slotKey = `${dstDateKey}|${a.startTime}|${a.endTime}|${a.role}`;
    if ((slotFilled.get(slotKey) ?? 0) >= req.agentCount) return "slot-full";

    const shiftKey = `${agent.id}|${dstDateKey}|${a.startTime}|${a.endTime}|${a.role}`;
    if (busyByAgentShift.has(shiftKey)) return "duplicate-shift";

    const dayKey = `${agent.id}|${dstDateKey}`;
    if (ln === "KIBRI" && medByAgentDate.has(dayKey)) return "kibri-med";
    if (ln === "DORCE" && pleyelByAgentDate.has(dayKey)) return "dorce-pleyel";

    const hours = a.hours ?? calculateShiftHours(a.startTime, a.endTime);
    await prisma.assignment.create({
      data: {
        planningMonthId: dstPm.id,
        agentId: agent.id,
        siteId: gemeaux.id,
        requirementId: req.id,
        date: parseDateKey(dstDateKey),
        shiftType: a.shiftType,
        role: a.role,
        startTime: a.startTime,
        endTime: a.endTime,
        hours,
        notes: `copy-${srcMonth}-to-${dstMonth}`,
      },
    });

    busyByAgentShift.add(shiftKey);
    slotFilled.set(slotKey, (slotFilled.get(slotKey) ?? 0) + 1);
    created++;
    return "ok";
  }

  function resolveAgent(a: (typeof srcRows)[0]): string | null {
    let ln = a.agent.lastName.toUpperCase();
    if (AGENT_REMAP[ln] !== undefined) {
      ln = AGENT_REMAP[ln];
      if (!ln) return null;
    }
    return ln;
  }

  const deferred: { a: (typeof srcRows)[0]; ln: string; reason: string }[] = [];

  for (const a of srcRows) {
    const srcDateKey = toDateKey(a.date);
    const dstDateKey = mapSourceDateToTarget(srcDateKey, year, dstMonth, mapMode);
    if (!dstDateKey) {
      skip("no-dst-date");
      continue;
    }

    const ln = resolveAgent(a);
    if (!ln) {
      skip("remap-empty");
      continue;
    }

    const result = await tryCreate(a, dstDateKey, ln);
    if (result !== "ok") deferred.push({ a, ln, reason: result });
  }

  for (const { a, ln, reason } of deferred) {
    const srcDateKey = toDateKey(a.date);
    const calKey = mapSourceDateToTarget(srcDateKey, year, dstMonth, "calendar");
    const weekdayKey = mapSourceDateToTarget(srcDateKey, year, dstMonth, mapMode);
    let result: string = reason;
    if (calKey && calKey !== weekdayKey) {
      const retry = await tryCreate(a, calKey, ln);
      if (retry === "ok") continue;
      result = retry;
    }
    skip(result);
  }

  console.log(`✓ ${created} affectations créées (${skipped} ignorées)`);
  if (skipped > 0) {
    for (const [r, n] of [...skipReasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${r}: ${n}`);
    }
  }

  // Ajustements légers (sans regénération auto) — octobre 2026
  if (dstMonth === 10 && year === 2026) {
    const aoufi = agentByLn.get("AOUFI");
    if (aoufi) {
      const n = await prisma.assignment.deleteMany({
        where: { planningMonthId: dstPm.id, siteId: gemeaux.id, agentId: aoufi.id },
      });
      if (n.count) console.log(`✓ AOUFI retiré: ${n.count}`);
    }
    if (med) {
      const kibri = agentByLn.get("KIBRI");
      if (kibri) {
        const medRows = await prisma.assignment.findMany({
          where: { planningMonthId: dstPm.id, siteId: med.id, agentId: kibri.id },
        });
        const medDates = new Set(medRows.map((r) => toDateKey(r.date)));
        const dup = await prisma.assignment.findMany({
          where: { planningMonthId: dstPm.id, siteId: gemeaux.id, agentId: kibri.id },
        });
        const dupIds = dup.filter((d) => medDates.has(toDateKey(d.date))).map((d) => d.id);
        if (dupIds.length) {
          await prisma.assignment.deleteMany({ where: { id: { in: dupIds } } });
          console.log(`✓ KIBRI: ${dupIds.length} doublon(s) Gémeaux/Médiathèque retirés`);
        }
      }
    }
    console.log("ℹ Pour la spec octobre (3 vac à la filet, etc.) : npx tsx prisma/fix-gemeaux-oct-2026-only.ts --enforce-only");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
