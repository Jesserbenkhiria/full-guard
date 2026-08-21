import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";
import { calculateShiftHours } from "../src/lib/planning/hours";

const prisma = new PrismaClient();
async function main() {
  const gemaux = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const visage = await prisma.site.findFirst({ where: { name: { contains: "VISAGE" } } });
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  if (!gemaux || !month) return;
  const asg = await prisma.assignment.findMany({
    where: { planningMonthId: month.id },
    include: { agent: true, site: true },
    orderBy: { date: "asc" },
  });
  for (const date of ["2026-09-02", "2026-09-13", "2026-09-25"]) {
    const rows = asg.filter(
      (a) => toDateKey(a.date) === date && a.siteId === gemaux.id
    );
    console.log("\nGEM", date);
    for (const a of rows) {
      console.log(" ", a.startTime, a.endTime, a.shiftType, a.agent.lastName);
    }
  }
  for (const name of ["DIAKITE", "YAHMADI"]) {
    const mine = asg.filter((a) => a.agent.lastName === name);
    const h = mine.reduce(
      (s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)),
      0
    );
    console.log("\n" + name, mine.length, "vac", h + "h");
    for (const a of mine) {
      if (a.siteId === gemaux.id || a.site.name.includes("VISAGE")) {
        console.log(
          " ",
          toDateKey(a.date),
          a.site.name.includes("VISAGE") ? "VISAGE" : "GEM",
          a.startTime,
          a.endTime
        );
      }
    }
  }
}
main().finally(() => prisma.$disconnect());
