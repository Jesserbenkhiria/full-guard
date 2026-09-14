import { prisma } from "../src/lib/db";
import { toDateKey } from "../src/lib/planning/dates";

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!pm || !g) return;
  const rows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: g.id },
    include: { agent: true },
  });
  const by = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.agent.lastName}|${toDateKey(r.date)}`;
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  const multi = [...by.entries()].filter(([, c]) => c > 1);
  console.log("Agents with 2+ Gémeaux shifts same day:", multi.length);
  for (const [k, c] of multi) console.log(c, k);
}

main().finally(() => prisma.$disconnect());
