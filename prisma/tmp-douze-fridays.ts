import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();
async function main() {
  const douze = await prisma.site.findFirst({ where: { name: { contains: "DOUZE" } } });
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  if (!douze || !month) return;
  const asg = await prisma.assignment.findMany({
    where: { siteId: douze.id, planningMonthId: month.id },
    include: { agent: true },
    orderBy: { date: "asc" },
  });
  for (const d of ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"]) {
    const day = asg.filter((a) => toDateKey(a.date) === d);
    console.log(
      d,
      day.map((a) => `${a.agent.lastName} ${a.startTime}-${a.endTime}`).join(" | ") || "(vide)"
    );
  }
}
main().finally(() => prisma.$disconnect());
