/**
 * Diagnose available Gémeaux DAY AGENT slots for KIBRI.
 */
import { PrismaClient, PositionRole, ShiftType } from "@prisma/client";
import { toDateKey, getDayOfWeek, parseDateKey } from "../src/lib/planning/dates";
import { calculateShiftHours } from "../src/lib/planning/hours";

const p = new PrismaClient();

async function main() {
  const pm = await p.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) return;

  const gem = await p.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const kibri = await p.agent.findFirst({ where: { lastName: "KIBRI" } });
  if (!gem || !kibri) return;

  const reqs = await p.siteRequirement.findMany({
    where: { siteId: gem.id, active: true, specificDate: null, role: PositionRole.AGENT, shiftType: ShiftType.DAY },
  });
  console.log("Gémeaux DAY AGENT requirements:");
  for (const r of reqs) console.log(`  ${r.startTime}-${r.endTime}  days=${r.days.join(",")}  agentCount=${r.agentCount}`);

  const allGem = await p.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: gem.id },
    include: { agent: true },
    orderBy: { date: "asc" },
  });

  const kibriMed = new Set(
    (await p.assignment.findMany({ where: { planningMonthId: pm.id, agentId: kibri.id } }))
      .map((a) => toDateKey(a.date))
  );

  // Find days with available slots
  console.log("\nAvailable DAY AGENT slots for KIBRI (not Med day, not busy):");
  const OCT_DAYS = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
  let found = 0;
  for (const dateKey of OCT_DAYS) {
    if (kibriMed.has(dateKey)) continue;
    const day = getDayOfWeek(parseDateKey(dateKey));

    for (const req of reqs) {
      if (!req.days.includes(day)) continue;
      const filled = allGem.filter(
        (a) => toDateKey(a.date) === dateKey && a.startTime === req.startTime && a.endTime === req.endTime
      );
      const available = req.agentCount - filled.length;
      if (available > 0) {
        const names = filled.map((a) => a.agent.lastName).join(",");
        console.log(`  ${dateKey} ${day.slice(0,3)}  ${req.startTime}-${req.endTime}  ${filled.length}/${req.agentCount} filled (${names}) → ${available} slot(s) open`);
        found++;
      }
    }
  }
  if (found === 0) console.log("  (none — all slots full)");

  // Summary of agents on Gémeaux
  const byAgent = new Map<string, number>();
  for (const a of allGem) {
    byAgent.set(a.agent.lastName, (byAgent.get(a.agent.lastName) ?? 0) + 1);
  }
  console.log("\nGémeaux agents count:");
  for (const [name, cnt] of [...byAgent.entries()].sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${name}: ${cnt} vac`);
  }
}

main().catch(console.error).finally(() => p.$disconnect());
