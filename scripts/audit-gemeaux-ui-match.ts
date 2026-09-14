import { prisma } from "../src/lib/db";
import { toDateKey, getDayOfWeek } from "../src/lib/planning/dates";
import { assignmentsMatchSlot } from "../src/lib/planning/shift-templates";

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) return;

  const gem = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
    include: { requirements: { where: { active: true } } },
  });
  if (!gem) return;

  const year = 2026;
  const month = 10;
  const monthDays: Date[] = [];
  for (let d = 1; d <= 31; d++) monthDays.push(new Date(Date.UTC(year, month - 1, d, 12)));

  const assignments = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: gem.id },
    include: { agent: true },
  });

  const dtos = assignments.map((a) => ({
    siteId: a.siteId,
    date: toDateKey(a.date),
    startTime: a.startTime,
    endTime: a.endTime,
    requirementId: a.requirementId,
    role: a.role,
    agent: a.agent.lastName,
  }));

  let totalSlots = 0;
  let filledInUi = 0;
  let orphanAssignments = 0;
  const mismatchedReqId: typeof dtos = [];

  for (const req of gem.requirements) {
    if (req.specificDate) continue;
    for (const day of monthDays) {
      const dateKey = toDateKey(day);
      if (!req.days.includes(getDayOfWeek(day))) continue;

      for (let i = 0; i < req.agentCount; i++) {
        totalSlots++;
        const slot = {
          siteId: gem.id,
          date: dateKey,
          startTime: req.startTime,
          endTime: req.endTime,
          requirementId: req.id,
          role: req.role ?? "AGENT",
        };
        const matching = dtos.filter((a) => assignmentsMatchSlot(a, slot));
        if (matching[i]) filledInUi++;
      }
    }
  }

  for (const a of dtos) {
    const req = gem.requirements.find((r) => r.id === a.requirementId);
    if (!req) {
      mismatchedReqId.push(a);
      continue;
    }
    const slot = {
      siteId: gem.id,
      date: a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      requirementId: req.id,
      role: req.role ?? "AGENT",
    };
    if (!assignmentsMatchSlot(a, slot)) mismatchedReqId.push(a);
  }

  console.log(`UI slot fill: ${filledInUi}/${totalSlots} (${totalSlots - filledInUi} appear vacant in UI)`);
  console.log(`Total DB assignments: ${assignments.length}`);
  if (mismatchedReqId.length) {
    console.log(`Assignments with bad/mismatched requirementId: ${mismatchedReqId.length}`);
    for (const a of mismatchedReqId.slice(0, 15)) {
      console.log(`  ${a.date} ${a.startTime}-${a.endTime} ${a.agent} req=${a.requirementId?.slice(0, 8)}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
