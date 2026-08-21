import { PrismaClient, AlertSeverity } from "@prisma/client";
import { getPlanningData } from "../src/services/planning/queries";
import { computeSiteCoverage } from "../src/lib/planning/summary";
import { toDateKey } from "../src/lib/planning/dates";
import { isWeekendDay, weekendPeriodKey } from "../src/lib/planning/weekends";

const prisma = new PrismaClient();

async function main() {
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  const gemaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
    include: { requirements: { where: { active: true } } },
  });
  if (!month || !gemaux) return;

  const assignments = await prisma.assignment.findMany({
    where: { planningMonthId: month.id, siteId: gemaux.id },
    include: { agent: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  console.log("=== Assignments by date ===");
  const byDate = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const k = toDateKey(a.date);
    const list = byDate.get(k) ?? [];
    list.push(a);
    byDate.set(k, list);
  }
  for (const [date, list] of [...byDate.entries()].sort()) {
    console.log(
      date,
      list
        .map(
          (a) =>
            `${a.startTime}-${a.endTime} ${a.shiftType} ${a.agent.lastName}`
        )
        .join(" | ")
    );
  }

  console.log("\n=== Weekend counts per agent ===");
  const weByAgent = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!isWeekendDay(a.date)) continue;
    const name = a.agent.lastName;
    const set = weByAgent.get(name) ?? new Set();
    set.add(weekendPeriodKey(a.date));
    weByAgent.set(name, set);
  }
  for (const [name, wes] of [...weByAgent.entries()].sort()) {
    console.log(name, [...wes].sort(), `(${wes.size} WE)`);
  }

  console.log("\n=== Errors ===");
  const alerts = await prisma.alert.findMany({
    where: {
      planningMonthId: month.id,
      resolved: false,
      severity: AlertSeverity.ERROR,
      OR: [{ siteId: gemaux.id }, { assignment: { siteId: gemaux.id } }],
    },
    include: { assignment: { include: { agent: true } } },
  });
  for (const a of alerts) {
    const d = a.assignment?.date ? toDateKey(a.assignment.date) : "-";
    console.log(d, a.assignment?.agent?.lastName ?? "-", a.ruleCode, a.message);
  }

  const planningData = await getPlanningData(2026, 9);
  const siteGroup = planningData.sites.find((s) => s.siteId === gemaux.id);
  if (siteGroup) {
    const cov = computeSiteCoverage(siteGroup);
    console.log("\n=== Missing slots ===");
    for (const m of cov.missing) {
      console.log(m.dateKey, m.startTime, m.endTime, m.shiftType, m.label);
    }
  }

  console.log("\n=== Requirements ===");
  for (const r of gemaux.requirements) {
    const sd = r.specificDate ? toDateKey(r.specificDate) : null;
    console.log(r.label, r.days, r.shiftType, r.startTime, r.endTime, r.agentCount, sd);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
