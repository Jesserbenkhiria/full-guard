import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const y = await prisma.agent.findFirst({ where: { lastName: "YAHMADI" } });
  const vis = await prisma.site.findFirst({ where: { name: { contains: "VISAGE" } } });
  const m = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  if (!y || !vis || !m) return;
  const a = await prisma.assignment.findMany({
    where: { agentId: y.id, planningMonthId: m.id, siteId: vis.id },
    orderBy: { date: "asc" },
  });
  for (const x of a) {
    console.log(x.date.toISOString().slice(0, 10), x.startTime, x.endTime);
  }
}
main().finally(() => prisma.$disconnect());
