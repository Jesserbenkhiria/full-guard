/**
 * Gémeaux — dernières permutations Lajimi (21/08 22h22) :
 * - Dim 13 soir → YAHMADI
 * - Ven 25 soir → DIAKITE
 * - Mer 2 soir → DIAKITE
 *
 * Run: npx tsx prisma/fix-gemeaux-lajimi-22h.ts
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
  const id = (last: string) => {
    const a = agents.find((x) => x.lastName === last);
    if (!a) throw new Error(last);
    return a.id;
  };

  const asg = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
  });

  async function setNight(date: string, toLast: string) {
    const row = asg.find(
      (a) => toDateKey(a.date) === date && a.startTime === "19:00"
    );
    if (!row) throw new Error(`Nuit ${date} introuvable`);
    const from = row.agent.lastName;
    if (from === toLast) {
      console.log(`= ${date} nuit déjà ${toLast}`);
      return;
    }
    await prisma.assignment.update({
      where: { id: row.id },
      data: { agentId: id(toLast) },
    });
    row.agent.lastName = toLast;
    console.log(`✓ ${date} nuit ${from} → ${toLast}`);
  }

  await setNight("2026-09-13", "YAHMADI");
  await setNight("2026-09-25", "DIAKITE");
  await setNight("2026-09-02", "DIAKITE");

  const refreshed = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
  });
  const byAgent = new Map<string, { n: number; h: number }>();
  for (const a of refreshed) {
    const cur = byAgent.get(a.agent.lastName) ?? { n: 0, h: 0 };
    cur.n += 1;
    cur.h += a.hours ?? calculateShiftHours(a.startTime, a.endTime);
    byAgent.set(a.agent.lastName, cur);
  }
  for (const name of ["DIAKITE", "YAHMADI", "DJEDIA", "HALIDI"]) {
    const v = byAgent.get(name);
    if (v) {
      console.log(
        `${name.padEnd(10)} ${String(v.n).padStart(2)} vac  ${Math.round(v.h * 10) / 10}h`
      );
    }
  }

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
