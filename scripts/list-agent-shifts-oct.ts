import { prisma } from "../src/lib/db";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { toDateKey } from "../src/lib/planning/dates";

async function main() {
  const ln = process.argv[2] ?? "SEITI";
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const ag = await prisma.agent.findFirst({ where: { lastName: ln } });
  if (!pm || !g || !ag) return;
  const rows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: g.id, agentId: ag.id },
    orderBy: { date: "asc" },
  });
  for (const r of rows) {
    console.log(
      toDateKey(r.date),
      r.startTime,
      r.endTime,
      (r.hours ?? calculateShiftHours(r.startTime, r.endTime)).toFixed(1)
    );
  }
}

main().finally(() => prisma.$disconnect());
