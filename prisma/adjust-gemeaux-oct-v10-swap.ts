/**
 * Gémeaux oct. 2026 — casse les séries > 3 jours par ÉCHANGE de postes
 * quand aucun poste n'est libre (préserve les volumes horaires validés).
 *
 * Run: npx tsx prisma/adjust-gemeaux-oct-v10-swap.ts
 */
import { DayOfWeek, PositionRole, PrismaClient, ShiftType } from "@prisma/client";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

const MAX_CONSECUTIVE = 3;
const DAY_MS = 86_400_000;

const LAJIMI_DAYS = new Set<DayOfWeek>([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
]);
const FRI_SAT = new Set<DayOfWeek>([DayOfWeek.FRIDAY, DayOfWeek.SATURDAY]);

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
  requirementId: string | null;
  siteId: string;
};

const isNight = (s: string, e: string) => e < s;

function localRunLength(busy: Set<string>, dateKey: string): number {
  const t = parseDateKey(dateKey).getTime();
  let len = 1;
  for (let i = 1; busy.has(toDateKey(new Date(t - i * DAY_MS))); i++) len++;
  for (let i = 1; busy.has(toDateKey(new Date(t + i * DAY_MS))); i++) len++;
  return len;
}

function agentAllows(ln: string, dateKey: string, r: Row): boolean {
  const day = getDayOfWeek(parseDateKey(dateKey));
  const night = isNight(r.startTime, r.endTime);
  switch (ln) {
    case "LAJIMI":
      return LAJIMI_DAYS.has(day) && !night && r.role === PositionRole.TEAM_LEADER;
    case "DJEDIA":
      return LAJIMI_DAYS.has(day) && !night && r.role === PositionRole.AGENT;
    case "DIAKITE":
      if (!night || r.role !== PositionRole.AGENT) return false;
      return !(dateKey >= "2026-10-19" && !FRI_SAT.has(day));
    case "DEMBELE":
    case "SEITI":
    case "HOUNGUES":
    case "KIBRI":
    case "EVINA":
      return !night && r.role === PositionRole.AGENT;
    case "YAHMADI":
      return night && r.role === PositionRole.AGENT;
    case "CHARGUI":
      return true;
    default:
      return false;
  }
}

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const gem = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const med = await prisma.site.findFirst({
    where: { OR: [{ name: { contains: "Horloge" } }, { name: { contains: "Médiath" } }] },
  });
  if (!pm || !gem) process.exit(1);

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
    requirementId: a.requirementId,
    siteId: a.siteId,
  }));

  const gemRows = () => rows.filter((r) => r.siteId === gem.id);
  const busyOf = (agentId: string) =>
    new Set(rows.filter((r) => r.agentId === agentId).map((r) => r.dateKey));
  const medOf = (agentId: string) =>
    new Set(rows.filter((r) => r.agentId === agentId && r.siteId === med?.id).map((r) => r.dateKey));

  async function swap(a: Row, b: Row) {
    await prisma.$transaction([
      prisma.assignment.update({
        where: { id: a.id },
        data: { agentId: b.agentId, notes: `v10 swap ${b.lastName}` },
      }),
      prisma.assignment.update({
        where: { id: b.id },
        data: { agentId: a.agentId, notes: `v10 swap ${a.lastName}` },
      }),
    ]);
    console.log(
      `  ⇄ ${a.lastName} ${a.dateKey} ↔ ${b.lastName} ${b.dateKey} (${a.hours}h / ${b.hours}h)`
    );
    const aAgent = a.agentId;
    const aName = a.lastName;
    a.agentId = b.agentId;
    a.lastName = b.lastName;
    b.agentId = aAgent;
    b.lastName = aName;
  }

  console.log("Séries > 3 jours — résolution par échange");
  for (let guard = 0; guard < 40; guard++) {
    let fixed = false;
    const agentIds = [...new Set(gemRows().map((r) => r.agentId))];

    for (const agentId of agentIds) {
      const busy = busyOf(agentId);
      const offenders = [...busy].filter((d) => localRunLength(busy, d) > MAX_CONSECUTIVE);
      if (!offenders.length) continue;

      const ln = gemRows().find((r) => r.agentId === agentId)!.lastName;

      for (const offDate of offenders) {
        const mine = gemRows().find((r) => r.agentId === agentId && r.dateKey === offDate);
        if (!mine) continue;

        // candidat : même durée, agent capable de prendre ma date, et moi la sienne
        const candidates = gemRows().filter(
          (o) =>
            o.agentId !== agentId &&
            o.hours === mine.hours &&
            o.role === mine.role &&
            o.dateKey !== mine.dateKey
        );

        let done = false;
        for (const other of candidates) {
          if (!agentAllows(ln, other.dateKey, other)) continue;
          if (!agentAllows(other.lastName, mine.dateKey, mine)) continue;
          if (ln === "KIBRI" && medOf(agentId).has(other.dateKey)) continue;
          if (other.lastName === "KIBRI" && medOf(other.agentId).has(mine.dateKey)) continue;

          const myBusy = busyOf(agentId);
          myBusy.delete(mine.dateKey);
          if (myBusy.has(other.dateKey)) continue;
          myBusy.add(other.dateKey);
          if (localRunLength(myBusy, other.dateKey) > MAX_CONSECUTIVE) continue;
          if ([...myBusy].some((d) => localRunLength(myBusy, d) > MAX_CONSECUTIVE)) continue;

          const otherBusy = busyOf(other.agentId);
          otherBusy.delete(other.dateKey);
          if (otherBusy.has(mine.dateKey)) continue;
          otherBusy.add(mine.dateKey);
          if ([...otherBusy].some((d) => localRunLength(otherBusy, d) > MAX_CONSECUTIVE)) continue;

          await swap(mine, other);
          done = true;
          break;
        }
        if (done) {
          fixed = true;
          break;
        }
      }
      if (fixed) break;
    }
    if (!fixed) break;
  }

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

  console.log("\nSéries restantes > 3 jours:");
  let any = false;
  for (const agentId of [...new Set(gemRows().map((r) => r.agentId))]) {
    const busy = busyOf(agentId);
    const max = Math.max(...[...busy].map((d) => localRunLength(busy, d)));
    if (max > MAX_CONSECUTIVE) {
      console.log(`  ${gemRows().find((r) => r.agentId === agentId)!.lastName}: ${max} jours`);
      any = true;
    }
  }
  if (!any) console.log("  (aucune) ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
