/**
 * Gémeaux — max 2 week-ends / agent.
 * LAJIMI chef sam 5 & 19 ; DJEDIA chef sam 12 & 26 + ces nuits-là.
 *
 * Run: npx tsx prisma/fix-gemeaux-weekends.ts
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
  if (!gemaux || !month) throw new Error("Gémeaux / septembre introuvable");

  const agents = await prisma.agent.findMany();
  const id = (last: string) => {
    const a = agents.find((x) => x.lastName === last);
    if (!a) throw new Error(last);
    return a.id;
  };

  const asg = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
  });

  async function find(date: string, start: string, last: string) {
    const row = asg.find(
      (a) =>
        toDateKey(a.date) === date &&
        a.startTime === start &&
        a.agent.lastName === last
    );
    if (!row) throw new Error(`Introuvable ${date} ${start} ${last}`);
    return row;
  }

  async function setAgent(
    date: string,
    start: string,
    fromLast: string,
    toLast: string,
    role?: PositionRole
  ) {
    const row = await find(date, start, fromLast);
    await prisma.assignment.update({
      where: { id: row.id },
      data: { agentId: id(toLast), ...(role ? { role } : {}) },
    });
    row.agent.lastName = toLast;
    console.log(
      `✓ ${date} ${start} ${fromLast} → ${toLast}${role ? ` (${role})` : ""}`
    );
  }

  // Sat 12 : d'abord l'agent 07-19 (DJEDIA), puis le chef
  await setAgent("2026-09-12", "07:00", "DJEDIA", "DIAKITE", PositionRole.AGENT);
  await setAgent("2026-09-12", "07:00", "LAJIMI", "DJEDIA", PositionRole.TEAM_LEADER);
  await setAgent("2026-09-12", "19:00", "YAHMADI", "DJEDIA");

  // Sat 26
  await setAgent("2026-09-26", "07:00", "DJEDIA", "DEMBELE", PositionRole.AGENT);
  await setAgent("2026-09-26", "07:00", "LAJIMI", "DJEDIA", PositionRole.TEAM_LEADER);
  await setAgent("2026-09-26", "19:00", "YAHMADI", "DJEDIA");

  // Sat 5 : 07-19 HOUNGUES (LAJIMI reste chef)
  await setAgent("2026-09-05", "07:00", "DJEDIA", "HOUNGUES", PositionRole.AGENT);
  await setAgent("2026-09-29", "07:00", "HOUNGUES", "DJEDIA");

  // Sat 19 : 07-19 DIAKITE ; 08-17:45 SEITI
  await setAgent("2026-09-19", "07:00", "DJEDIA", "DIAKITE", PositionRole.AGENT);
  await setAgent("2026-09-19", "08:00", "DEMBELE", "SEITI");
  await setAgent("2026-09-10", "07:00", "SEITI", "DJEDIA");

  // Sun 13 : EVINA (même WE que son samedi 12)
  await setAgent("2026-09-13", "07:00", "DEMBELE", "EVINA");

  const { validateSitePlanningGate } = await import(
    "../src/services/rules/validate-site-planning-gate"
  );
  const gate = await validateSitePlanningGate(month.id, gemaux.id);
  if (gate.canValidate) {
    console.log("\n✓ Les Gémeaux validé");
  } else {
    console.log(`\n✗ ${gate.blockingMessages.join(" · ")}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
