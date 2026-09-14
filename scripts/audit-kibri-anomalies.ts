import { prisma } from "../src/lib/db";
import { toDateKey, getDayOfWeek } from "../src/lib/planning/dates";
import { DayOfWeek } from "@prisma/client";

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) return;

  const gem = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const med = await prisma.site.findFirst({
    where: { OR: [{ name: { contains: "Horloge" } }, { name: { contains: "Médiath" } }] },
  });

  for (const ln of ["KIBRI", "DJEDIA", "LAJIMI", "CHARGUI", "EVINA"]) {
    const agent = await prisma.agent.findFirst({ where: { lastName: ln } });
    if (!agent) continue;
    const rows = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, agentId: agent.id },
      include: { site: true },
      orderBy: { date: "asc" },
    });
    const h = rows.reduce((s, a) => s + (a.hours ?? 0), 0);
    console.log(`\n${ln}: ${h.toFixed(1)}h, ${rows.length} vac`);
    for (const a of rows) {
      const dk = toDateKey(a.date);
      const day = getDayOfWeek(a.date);
      console.log(`  ${dk} ${day.slice(0, 3)} ${a.site.name.slice(0, 12)} ${a.startTime}-${a.endTime} ${a.role} id=${a.id}`);
    }
  }

  const kibri = await prisma.agent.findFirst({ where: { lastName: "KIBRI" } });
  if (kibri && gem && med) {
    const kRows = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, agentId: kibri.id },
    });
    for (const d of ["2026-10-07", "2026-10-03", "2026-10-17"]) {
      const same = kRows.filter((a) => toDateKey(a.date) === d);
      if (same.length > 1) console.log(`\nKIBRI doublon ${d}:`, same.map((x) => x.siteId === gem.id ? "Gémeaux" : "Med"));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
