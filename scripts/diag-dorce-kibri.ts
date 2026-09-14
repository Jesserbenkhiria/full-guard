import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

const p = new PrismaClient();

async function main() {
  const pm = await p.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) { console.log("No PM"); return; }

  const dorce = await p.agent.findFirst({ where: { lastName: "DORCE" } });
  const kibri = await p.agent.findFirst({ where: { lastName: "KIBRI" } });

  // DORCE assignments
  if (dorce) {
    const da = await p.assignment.findMany({
      where: { planningMonthId: pm.id, agentId: dorce.id },
      include: { site: true },
      orderBy: { date: "asc" },
    });
    const dh = da.reduce((s, a) => s + (a.hours ?? 0), 0);
    console.log(`\nDORCE: ${da.length} vac, ${dh.toFixed(1)} h`);
    for (const a of da) {
      console.log(`  ${toDateKey(a.date)}  ${a.site.name.padEnd(12)}  ${a.startTime}-${a.endTime}  ${a.shiftType}  id=${a.id}`);
    }
  }

  // KIBRI assignments
  if (kibri) {
    const ka = await p.assignment.findMany({
      where: { planningMonthId: pm.id, agentId: kibri.id },
      include: { site: true },
      orderBy: { date: "asc" },
    });
    const kh = ka.reduce((s, a) => s + (a.hours ?? 0), 0);
    console.log(`\nKIBRI: ${ka.length} vac, ${kh.toFixed(1)} h`);
    for (const a of ka) {
      console.log(`  ${toDateKey(a.date)}  ${a.site.name.padEnd(25)}  ${a.startTime}-${a.endTime}  id=${a.id}`);
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
