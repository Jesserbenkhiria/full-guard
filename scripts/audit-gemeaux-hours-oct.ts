import { prisma } from "../src/lib/db";
import { calculateShiftHours } from "../src/lib/planning/hours";

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!pm || !g) return;
  for (const ln of ["CHARGUI", "DEMBELE", "SEITI", "HOUNGUES", "DIAKITE", "LAJIMI", "DJEDIA"]) {
    const ag = await prisma.agent.findFirst({ where: { lastName: ln } });
    if (!ag) continue;
    const rows = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, agentId: ag.id, siteId: g.id },
    });
    const h = rows.reduce((s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)), 0);
    console.log(`${ln}: ${rows.length} vac, ${h.toFixed(1)} h`);
  }
}

main().finally(() => prisma.$disconnect());
