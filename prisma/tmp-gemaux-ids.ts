import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

async function main() {
  const gemaux = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  const assignments = await prisma.assignment.findMany({
    where: { siteId: gemaux!.id, planningMonthId: month!.id },
    include: { agent: true },
    orderBy: { date: "asc" },
  });
  for (const a of assignments) {
    if (!["2026-09-05","2026-09-12","2026-09-19","2026-09-26","2026-09-27"].includes(toDateKey(a.date))) continue;
    console.log(toDateKey(a.date), a.startTime, a.endTime, a.agent.firstName, a.agent.lastName, a.id);
  }
}

main().finally(() => prisma.$disconnect());
