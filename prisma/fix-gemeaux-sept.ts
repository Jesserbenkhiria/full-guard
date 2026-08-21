/**
 * Les Gémeaux — septembre 2026 : corrige MAX_WEEKENDS + poste manquant.
 *
 * Run: npx tsx prisma/fix-gemeaux-sept.ts
 */
import { PrismaClient, ShiftType } from "@prisma/client";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, toDateKey } from "../src/lib/planning/dates";
import { isWeekendDay, weekendPeriodKey } from "../src/lib/planning/weekends";

const prisma = new PrismaClient();

type Patch = {
  date: string;
  startTime: string;
  endTime: string;
  fromLastName: string;
  toLastName: string;
};

const PATCHES: Patch[] = [
  // --- Round 1 (samedis LAJIMI/DJEDIA → max 2 WE) ---
  { date: "2026-09-05", startTime: "07:00", endTime: "19:00", fromLastName: "DJEDIA", toLastName: "SEITI" },
  { date: "2026-09-12", startTime: "07:00", endTime: "19:00", fromLastName: "DJEDIA", toLastName: "DIAKITE" },
  { date: "2026-09-12", startTime: "19:00", endTime: "07:00", fromLastName: "DIAKITE", toLastName: "AOUFI" },
  { date: "2026-09-19", startTime: "07:00", endTime: "19:00", fromLastName: "LAJIMI", toLastName: "DEMBELE" },
  { date: "2026-09-26", startTime: "07:00", endTime: "19:00", fromLastName: "LAJIMI", toLastName: "DEMBELE" },
  { date: "2026-09-26", startTime: "07:00", endTime: "19:00", fromLastName: "SEITI", toLastName: "DIAKITE" },
  { date: "2026-09-27", startTime: "07:00", endTime: "19:00", fromLastName: "DJEDIA", toLastName: "SEITI" },
  { date: "2026-09-27", startTime: "19:00", endTime: "07:00", fromLastName: "AOUFI", toLastName: "DIAKITE" },
  // --- Round 2 (transitions jour/nuit + max 2 WE nuits) ---
  { date: "2026-09-05", startTime: "19:00", endTime: "07:00", fromLastName: "DIAKITE", toLastName: "AOUFI" },
  { date: "2026-09-12", startTime: "07:00", endTime: "19:00", fromLastName: "DIAKITE", toLastName: "SEITI" },
  { date: "2026-09-12", startTime: "19:00", endTime: "07:00", fromLastName: "AOUFI", toLastName: "DIAKITE" },
  { date: "2026-09-26", startTime: "07:00", endTime: "19:00", fromLastName: "DEMBELE", toLastName: "HOUNGUES" },
  { date: "2026-09-26", startTime: "07:00", endTime: "19:00", fromLastName: "DIAKITE", toLastName: "SEITI" },
  { date: "2026-09-26", startTime: "19:00", endTime: "07:00", fromLastName: "AOUFI", toLastName: "DIAKITE" },
  // --- Round 3 (SEITI / HOUNGUES week-ends) ---
  { date: "2026-09-26", startTime: "07:00", endTime: "19:00", fromLastName: "SEITI", toLastName: "LAJIMI" },
  { date: "2026-09-27", startTime: "07:00", endTime: "19:00", fromLastName: "HOUNGUES", toLastName: "DJEDIA" },
];

async function main() {
  const gemaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
    include: { requirements: { where: { active: true } } },
  });
  const month = await prisma.planningMonth.findFirst({
    where: { year: 2026, month: 9 },
  });
  if (!gemaux || !month) throw new Error("Gémeaux ou septembre 2026 introuvable");

  const agents = await prisma.agent.findMany();
  const agentByLast = new Map(agents.map((a) => [a.lastName, a]));

  const assignments = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
  });

  let updated = 0;
  for (const patch of PATCHES) {
    const toAgent = agentByLast.get(patch.toLastName);
    if (!toAgent) throw new Error(`Agent ${patch.toLastName} introuvable`);

    const assignment = assignments.find(
      (a) =>
        toDateKey(a.date) === patch.date &&
        a.startTime === patch.startTime &&
        a.endTime === patch.endTime &&
        a.agent.lastName === patch.fromLastName
    );

    if (!assignment) {
      console.warn(
        `⚠ Introuvable: ${patch.date} ${patch.startTime}-${patch.endTime} ${patch.fromLastName}`
      );
      continue;
    }

    if (assignment.agentId === toAgent.id) continue;

    await prisma.alert.deleteMany({ where: { assignmentId: assignment.id } });
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { agentId: toAgent.id },
    });
    assignment.agentId = toAgent.id;
    assignment.agent = toAgent;
    updated++;
    console.log(
      `  ${patch.date} ${patch.startTime}-${patch.endTime}: ${patch.fromLastName} → ${patch.toLastName}`
    );
  }

  const sep28Night = assignments.find(
    (a) =>
      toDateKey(a.date) === "2026-09-28" &&
      a.startTime === "19:00" &&
      a.endTime === "07:00"
  );
  if (!sep28Night) {
    const diakite = agentByLast.get("DIAKITE");
    if (!diakite) throw new Error("DIAKITE introuvable");
    const req = gemaux.requirements.find(
      (r) =>
        r.shiftType === ShiftType.NIGHT &&
        r.startTime === "19:00" &&
        r.endTime === "07:00" &&
        r.days.includes(getDayOfWeek(new Date("2026-09-28T12:00:00.000Z")))
    );
    await prisma.assignment.create({
      data: {
        planningMonthId: month.id,
        agentId: diakite.id,
        siteId: gemaux.id,
        requirementId: req?.id ?? null,
        date: new Date("2026-09-28T12:00:00.000Z"),
        shiftType: ShiftType.NIGHT,
        role: "AGENT",
        startTime: "19:00",
        endTime: "07:00",
        hours: calculateShiftHours("19:00", "07:00"),
      },
    });
    console.log("  2026-09-28 19:00-07:00: (nouveau) → DIAKITE");
    updated++;
  }

  console.log(`\n✓ ${updated} modification(s)`);

  const final = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
  });

  const weByAgent = new Map<string, Set<string>>();
  for (const a of final) {
    if (!isWeekendDay(a.date)) continue;
    const set = weByAgent.get(a.agent.lastName) ?? new Set();
    set.add(weekendPeriodKey(a.date));
    weByAgent.set(a.agent.lastName, set);
  }
  console.log("\nWeek-ends par agent:");
  for (const [name, wes] of [...weByAgent.entries()].sort()) {
    const flag = wes.size > 2 ? " ⚠" : "";
    console.log(`  ${name}: ${wes.size}${flag}`);
  }

  const { validateSitePlanningGate } = await import(
    "../src/services/rules/validate-site-planning-gate"
  );
  const gate = await validateSitePlanningGate(month.id, gemaux.id);
  if (gate.canValidate) {
    console.log("\n✓ Les Gémeaux validé");
  } else {
    console.log(`\n✗ Non validé: ${gate.blockingMessages.join(" · ")}`);
    const errors = await prisma.alert.findMany({
      where: {
        planningMonthId: month.id,
        resolved: false,
        severity: "ERROR",
        assignment: { siteId: gemaux.id },
      },
      include: { assignment: { include: { agent: true } } },
    });
    for (const e of [...new Map(errors.map((x) => [x.message, x])).values()].slice(0, 10)) {
      console.log(`  → ${e.message}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
