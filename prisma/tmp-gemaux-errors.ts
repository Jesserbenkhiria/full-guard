import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const m = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  if (!g || !m) return;
  const a = await prisma.assignment.findMany({
    where: { siteId: g.id, planningMonthId: m.id },
    include: { agent: true, alerts: true },
  });
  for (const x of a) {
    for (const al of x.alerts.filter((e) => e.severity === "ERROR")) {
      console.log(x.date.toISOString().slice(0, 10), x.agent.lastName, al.ruleCode, al.message);
    }
  }
}
main().finally(() => prisma.$disconnect());
