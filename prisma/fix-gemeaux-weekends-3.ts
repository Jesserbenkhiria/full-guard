import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

async function main() {
  const gemaux = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  if (!gemaux || !month) throw new Error("missing");
  const agents = await prisma.agent.findMany();
  const id = (n: string) => agents.find((a) => a.lastName === n)!.id;
  const asg = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
  });

  async function setAgent(date: string, start: string, fromLast: string, toLast: string) {
    const row = asg.find(
      (a) => toDateKey(a.date) === date && a.startTime === start && a.agent.lastName === fromLast
    );
    if (!row) throw new Error(`${date} ${start} ${fromLast}`);
    await prisma.assignment.update({ where: { id: row.id }, data: { agentId: id(toLast) } });
    row.agent.lastName = toLast;
    console.log(`✓ ${date} ${start} ${fromLast} → ${toLast}`);
  }

  await setAgent("2026-09-20", "19:00", "DIAKITE", "YAHMADI");
  await setAgent("2026-09-06", "19:00", "YAHMADI", "HALIDI");

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
