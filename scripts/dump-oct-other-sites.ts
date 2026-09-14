import { prisma } from "../src/lib/db";
import { toDateKey, getDayOfWeek } from "../src/lib/planning/dates";

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) return;
  const gem = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });

  for (const ln of ["DORCE", "YAHMADI", "KIBRI"]) {
    const ag = await prisma.agent.findFirst({ where: { lastName: ln } });
    if (!ag) continue;
    const rows = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, agentId: ag.id },
      include: { site: true },
      orderBy: { date: "asc" },
    });
    console.log(`\n=== ${ln} ===`);
    for (const r of rows) {
      console.log(
        `  ${toDateKey(r.date)} ${getDayOfWeek(r.date).slice(0, 3)} ${r.startTime}-${r.endTime} ${r.site.name}${r.siteId === gem?.id ? " (GEM)" : ""}`
      );
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
