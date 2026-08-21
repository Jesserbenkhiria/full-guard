import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";
import { isWeekendDay, weekendPeriodKey } from "../src/lib/planning/weekends";

const prisma = new PrismaClient();
async function main() {
  const gemaux = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  if (!gemaux || !month) return;
  const asg = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
    orderBy: { date: "asc" },
  });
  const we = new Map<string, Set<string>>();
  for (const a of asg) {
    if (!isWeekendDay(a.date)) continue;
    const set = we.get(a.agent.lastName) ?? new Set();
    set.add(weekendPeriodKey(a.date) + " " + toDateKey(a.date) + " " + a.startTime + " " + a.role);
    we.set(a.agent.lastName, set);
  }
  for (const [name, set] of [...we.entries()].sort()) {
    console.log("\n" + name);
    for (const x of [...set].sort()) console.log("  " + x);
  }
}
main().finally(() => prisma.$disconnect());
