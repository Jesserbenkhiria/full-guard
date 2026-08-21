/**
 * Gémeaux — Lajimi 21/08 22:22
 * Dim 13 soir → YAHMADI
 * Ven 25 soir → DIAKITE
 * Mer 2 soir → DIAKITE
 * DIAKITE → 13 vac / 156 h
 *
 * Run: npx tsx prisma/fix-gemeaux-lajimi-nights.ts
 */
import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";
import { calculateShiftHours } from "../src/lib/planning/hours";

const prisma = new PrismaClient();

async function main() {
  const gemaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
  });
  const month = await prisma.planningMonth.findFirst({
    where: { year: 2026, month: 9 },
  });
  if (!gemaux || !month) throw new Error("Gémeaux / septembre introuvable");

  const agents = await prisma.agent.findMany();
  const id = (last: string) => agents.find((a) => a.lastName === last)!.id;
  const asg = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
  });

  async function setNight(date: string, fromLast: string, toLast: string) {
    const row = asg.find(
      (a) =>
        toDateKey(a.date) === date &&
        a.startTime === "19:00" &&
        a.agent.lastName === fromLast
    );
    if (!row) throw new Error(`Nuit ${date} ${fromLast} introuvable`);
    await prisma.assignment.update({
      where: { id: row.id },
      data: { agentId: id(toLast) },
    });
    row.agent.lastName = toLast;
    console.log(`✓ ${date} 19:00 ${fromLast} → ${toLast}`);
  }

  await setNight("2026-09-13", "DIAKITE", "YAHMADI");
  await setNight("2026-09-25", "YAHMADI", "DIAKITE");
  await setNight("2026-09-02", "DJEDIA", "DIAKITE");

  const diakite = await prisma.assignment.findMany({
    where: {
      planningMonthId: month.id,
      agentId: id("DIAKITE"),
    },
  });
  const hours = diakite.reduce(
    (s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)),
    0
  );
  console.log(`DIAKITE ${diakite.length} vac  ${hours}h`);

  const { validateSitePlanningGate } = await import(
    "../src/services/rules/validate-site-planning-gate"
  );
  const gate = await validateSitePlanningGate(month.id, gemaux.id);
  if (gate.canValidate) console.log("\n✓ Les Gémeaux validé");
  else console.log(`\n✗ ${gate.blockingMessages.join(" · ")}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
