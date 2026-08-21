import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

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
  for (const name of ["DIAKITE", "DJEDIA", "LAJIMI"]) {
    console.log("\n--- " + name);
    for (const a of asg.filter((x) => x.agent.lastName === name)) {
      console.log(
        toDateKey(a.date),
        a.role,
        a.shiftType,
        a.startTime + "-" + a.endTime
      );
    }
  }
}
main().finally(() => prisma.$disconnect());
