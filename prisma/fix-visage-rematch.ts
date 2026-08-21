/**
 * VISAGE DU MONDE — recolle les affectations septembre aux exigences actuelles.
 * Les 15 vacations existent déjà (HALIDI dim 20/27, YAHMADI le reste).
 *
 * Run: npx tsx prisma/fix-visage-rematch.ts
 */
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
  if (!visage || !month) throw new Error("VISAGE ou septembre 2026 introuvable");

  const assignments = await prisma.assignment.findMany({
    where: { siteId: visage.id, planningMonthId: month.id },
    include: { agent: true },
  });

  let linked = 0;
  for (const a of assignments) {
    const dateKey = toDateKey(a.date);
    const req = visage.requirements.find(
      (r) =>
        r.specificDate &&
        toDateKey(r.specificDate) === dateKey &&
        r.startTime === a.startTime &&
        r.endTime === a.endTime
    );
    if (!req) {
      console.warn(
        `⚠ Pas d'exigence: ${dateKey} ${a.startTime}-${a.endTime} ${a.agent.lastName}`
      );
      continue;
    }
    if (a.requirementId === req.id) continue;
    await prisma.assignment.update({
      where: { id: a.id },
      data: { requirementId: req.id },
    });
    linked++;
    console.log(
      `✓ ${dateKey} ${a.startTime}-${a.endTime} ${a.agent.lastName}`
    );
  }

  console.log(`Recollé ${linked}/${assignments.length} affectations`);

  const { validateSitePlanningGate } = await import(
    "../src/services/rules/validate-site-planning-gate"
  );
  const gate = await validateSitePlanningGate(month.id, visage.id);
  if (gate.canValidate) {
    console.log("✓ VISAGE DU MONDE validé");
  } else {
    console.log(`✗ Non validé: ${gate.blockingMessages.join(" · ")}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
