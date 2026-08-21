/**
 * Les Gémeaux — aligne septembre sur la consigne Lajimi, puis valide.
 * - LAJIMI chef les 4 samedis (lun–jeu + sam, pas vendredi/soir/dimanche)
 * - AOUFI max 5 vacations (retire la nuit du 7 → DIAKITE)
 *
 * Run: npx tsx prisma/fix-gemeaux-lajimi-align.ts
 */
import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

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
  const byLast = new Map(agents.map((a) => [a.lastName, a]));
  const lajimi = byLast.get("LAJIMI");
  const djedia = byLast.get("DJEDIA");
  const aoufi = byLast.get("AOUFI");
  const diakite = byLast.get("DIAKITE");
  if (!lajimi || !djedia || !aoufi || !diakite) {
    throw new Error("Agent manquant");
  }

  const asg = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
  });

  for (const dateKey of ["2026-09-12", "2026-09-19"]) {
    const chef = asg.find(
      (a) =>
        toDateKey(a.date) === dateKey &&
        a.startTime === "07:00" &&
        a.endTime === "19:00" &&
        a.role === "TEAM_LEADER"
    );
    if (!chef) {
      console.warn(`⚠ Chef samedi introuvable ${dateKey}`);
      continue;
    }
    if (chef.agentId === lajimi.id) {
      console.log(`= ${dateKey} chef déjà LAJIMI`);
      continue;
    }
    await prisma.assignment.update({
      where: { id: chef.id },
      data: { agentId: lajimi.id },
    });
    console.log(`✓ ${dateKey} chef ${chef.agent.lastName} → LAJIMI`);
  }

  const aoufiNight7 = asg.find(
    (a) =>
      toDateKey(a.date) === "2026-09-07" &&
      a.startTime === "19:00" &&
      a.agentId === aoufi.id
  );
  if (aoufiNight7) {
    await prisma.assignment.update({
      where: { id: aoufiNight7.id },
      data: { agentId: diakite.id },
    });
    console.log("✓ 2026-09-07 nuit AOUFI → DIAKITE (AOUFI reste à 5 vac)");
  }

  const { validateSitePlanningGate } = await import(
    "../src/services/rules/validate-site-planning-gate"
  );
  const gate = await validateSitePlanningGate(month.id, gemaux.id);
  if (gate.canValidate) {
    console.log("\n✓ Les Gémeaux validé");
  } else {
    console.log(`\n✗ Non validé: ${gate.blockingMessages.join(" · ")}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
