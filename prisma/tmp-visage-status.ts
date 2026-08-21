import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

async function main() {
  const visage = await prisma.site.findFirst({
    where: { name: "VISAGE DU MONDE" },
    include: { requirements: { where: { active: true } } },
  });
  const month = await prisma.planningMonth.findFirst({
    where: { year: 2026, month: 9 },
  });
  if (!visage || !month) {
    console.log("missing site/month");
    return;
  }

  const assignments = await prisma.assignment.findMany({
    where: { siteId: visage.id, planningMonthId: month.id },
    include: { agent: true },
    orderBy: { date: "asc" },
  });

  console.log(`requirements: ${visage.requirements.length}`);
  for (const r of visage.requirements) {
    const d = r.specificDate ? toDateKey(r.specificDate) : "recurring";
    console.log(`  req ${r.id.slice(-6)} ${d} ${r.startTime}-${r.endTime}`);
  }

  console.log(`assignments: ${assignments.length}`);
  for (const a of assignments) {
    const match = a.requirementId
      ? visage.requirements.some((r) => r.id === a.requirementId)
      : false;
    console.log(
      `  ${toDateKey(a.date)} ${a.startTime}-${a.endTime} ${a.agent.lastName} req=${a.requirementId ? a.requirementId.slice(-6) : "null"} ${match ? "OK" : "STALE"}`
    );
  }
}

main().finally(() => prisma.$disconnect());
