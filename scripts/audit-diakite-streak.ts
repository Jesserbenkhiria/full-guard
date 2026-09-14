import { prisma } from "../src/lib/db";
import { toDateKey } from "../src/lib/planning/dates";

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const d = await prisma.agent.findFirst({ where: { lastName: "DIAKITE" } });
  if (!pm || !g || !d) return;

  const all = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, agentId: d.id },
    orderBy: { date: "asc" },
  });
  const dates = [...new Set(all.map((a) => toDateKey(a.date)))].sort();
  console.log("DIAKITE all sites dates:", dates.join(", "));

  let run = 1;
  let maxRun = 1;
  for (let i = 1; i < dates.length; i++) {
    const a = new Date(dates[i - 1]! + "T12:00:00.000Z");
    const b = new Date(dates[i]! + "T12:00:00.000Z");
    const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000);
    if (diff === 1) {
      run++;
      maxRun = Math.max(maxRun, run);
    } else run = 1;
  }
  console.log("Max consecutive days:", maxRun);
}

main().catch(console.error).finally(() => prisma.$disconnect());
