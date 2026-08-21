import { PrismaClient, ShiftType } from "@prisma/client";
import { getDayOfWeek, toDateKey } from "../src/lib/planning/dates";
import { validateSitePlanningGate } from "../src/services/rules/validate-site-planning-gate";

const prisma = new PrismaClient();

async function rematchGemaux() {
  const gemaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
    include: { requirements: { where: { active: true } } },
  });
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  if (!gemaux || !month) return;

  const assignments = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
  });

  let n = 0;
  for (const a of assignments) {
    const day = getDayOfWeek(a.date);
    const req = gemaux.requirements.find(
      (r) =>
        r.startTime === a.startTime &&
        r.endTime === a.endTime &&
        r.shiftType === a.shiftType &&
        r.days.includes(day)
    );
    if (req && a.requirementId !== req.id) {
      await prisma.assignment.update({
        where: { id: a.id },
        data: { requirementId: req.id },
      });
      n++;
    }
  }
  console.log(`✓ Gémeaux: ${n} affectations recollées aux exigences`);
}

async function main() {
  await rematchGemaux();
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  const gemaux = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const gate = await validateSitePlanningGate(month!.id, gemaux!.id);
  console.log(gate.canValidate ? "✓ Gémeaux validé" : gate.blockingMessages.join(" · "));
}

main().finally(() => prisma.$disconnect());
