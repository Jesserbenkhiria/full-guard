import { prisma } from "../src/lib/db";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { toDateKey } from "../src/lib/planning/dates";

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  console.log("PlanningMonth 10/2026:", pm?.id, pm?.status);

  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  console.log("\n--- Sites ---");
  for (const s of sites) console.log(`  ${s.id} ${s.name} (active=${s.active})`);

  console.log("\n--- Agents (Gémeaux-related) ---");
  const agents = await prisma.agent.findMany({ orderBy: { lastName: "asc" } });
  for (const a of agents) {
    console.log(
      `  ${a.lastName.padEnd(12)} ${a.firstName.padEnd(16)} contract=${String(a.contractHours).padStart(4)} TL=${a.isTeamLeader ? "Y" : "n"} night=${a.canWorkNight ? "Y" : "n"} dayOnly=${a.dayOnly ? "Y" : "n"} restr=${a.siteRestrictionType} active=${a.active}`
    );
  }

  if (!pm) return;

  console.log("\n--- October 2026 assignments per site ---");
  const all = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id },
    include: { agent: true, site: true },
  });
  const bySite = new Map<string, number>();
  for (const a of all) bySite.set(a.site.name, (bySite.get(a.site.name) ?? 0) + 1);
  for (const [n, c] of bySite) console.log(`  ${n}: ${c}`);

  const gem = sites.find((s) => s.name.includes("Gémeaux"));
  if (!gem) return;

  console.log("\n--- Gémeaux Oct hours per agent (current) ---");
  const rows = all.filter((a) => a.siteId === gem.id);
  const byAgent = new Map<string, { n: number; h: number; nights: number }>();
  for (const r of rows) {
    const ln = r.agent.lastName.toUpperCase();
    const s = byAgent.get(ln) ?? { n: 0, h: 0, nights: 0 };
    s.n++;
    s.h += r.hours ?? calculateShiftHours(r.startTime, r.endTime);
    if (r.shiftType === "NIGHT") s.nights++;
    byAgent.set(ln, s);
  }
  let tot = 0;
  for (const [ln, s] of [...byAgent.entries()].sort((a, b) => b[1].h - a[1].h)) {
    tot += s.h;
    console.log(`  ${ln.padEnd(12)} ${s.h.toFixed(1).padStart(6)} h  (${s.n} vac, ${s.nights} nuit)`);
  }
  console.log(`  TOTAL ${tot.toFixed(1)} h / ${rows.length} vac`);

  console.log("\n--- Other-site Oct hours per agent (non-Gémeaux) ---");
  const byAgentOther = new Map<string, { n: number; h: number }>();
  for (const r of all.filter((a) => a.siteId !== gem.id)) {
    const key = `${r.agent.lastName.toUpperCase()} @ ${r.site.name}`;
    const s = byAgentOther.get(key) ?? { n: 0, h: 0 };
    s.n++;
    s.h += r.hours ?? calculateShiftHours(r.startTime, r.endTime);
    byAgentOther.set(key, s);
  }
  for (const [k, s] of [...byAgentOther.entries()].sort()) {
    console.log(`  ${k.padEnd(34)} ${s.h.toFixed(1).padStart(6)} h (${s.n} vac)`);
  }

  console.log("\n--- Vacations / absences overlapping October 2026 ---");
  const start = new Date("2026-10-01T00:00:00.000Z");
  const end = new Date("2026-10-31T23:59:59.000Z");
  const vacs = await prisma.vacation.findMany({
    where: { startDate: { lte: end }, endDate: { gte: start } },
    include: { agent: true },
  });
  for (const v of vacs) {
    console.log(`  ${v.agent.lastName}: ${toDateKey(v.startDate)} → ${toDateKey(v.endDate)} ${v.reason ?? ""}`);
  }
  const abs = await prisma.absence.findMany({
    where: { startDate: { lte: end }, endDate: { gte: start } },
    include: { agent: true },
  });
  for (const v of abs) {
    console.log(`  [abs] ${v.agent.lastName}: ${toDateKey(v.startDate)} → ${toDateKey(v.endDate)} ${v.reason}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
