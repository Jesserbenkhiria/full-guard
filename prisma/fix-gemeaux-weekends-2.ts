/**
 * Gémeaux — finir le plafond 2 week-ends (DIAKITE repos + YAHMADI VISAGE).
 * Run: npx tsx prisma/fix-gemeaux-weekends-2.ts
 */
import { PrismaClient, PositionRole } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

async function main() {
  const gemaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
  });
  const month = await prisma.planningMonth.findFirst({
    where: { year: 2026, month: 9 },
  });
  if (!gemaux || !month) throw new Error("missing");

  const agents = await prisma.agent.findMany();
  const id = (last: string) => agents.find((a) => a.lastName === last)!.id;
  const asg = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
  });

  async function setAgent(date: string, start: string, fromLast: string, toLast: string, role?: PositionRole) {
    const row = asg.find(
      (a) =>
        toDateKey(a.date) === date &&
        a.startTime === start &&
        a.agent.lastName === fromLast
    );
    if (!row) throw new Error(`${date} ${start} ${fromLast}`);
    await prisma.assignment.update({
      where: { id: row.id },
      data: { agentId: id(toLast), ...(role ? { role } : {}) },
    });
    row.agent.lastName = toLast;
    console.log(`✓ ${date} ${start} ${fromLast} → ${toLast}`);
  }

  // Sat 12 07-19 : HOUNGUES (pas DIAKITE — nuit 11 puis jour 12)
  await setAgent("2026-09-12", "07:00", "DIAKITE", "HOUNGUES", PositionRole.AGENT);
  await setAgent("2026-09-25", "07:00", "HOUNGUES", "DIAKITE");

  // YAHMADI : plus que WE1 (dim 6). WE3 → HALIDI / DIAKITE (VISAGE dim 27 = déjà 1 WE)
  await setAgent("2026-09-19", "19:00", "YAHMADI", "HALIDI");
  await setAgent("2026-09-20", "19:00", "YAHMADI", "DIAKITE");

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
