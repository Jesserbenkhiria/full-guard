/**
 * Gémeaux — spec finale Lajimi.
 * - HOUNGUES ≤ 120 h
 * - DEMBELE : un peu moins de week-ends (pas excessif)
 * - HALIDI : quelques nuits hors Campus Saint Christophe et indispo 11–13
 * - VISAGE dim 27 : HALIDI occupé Campus → YAHMADI
 *
 * Run: npx tsx prisma/fix-gemeaux-final-spec.ts
 */
import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

const CAMPUS_DATES = [
  "2026-09-01",
  "2026-09-02",
  "2026-09-04",
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-14",
  "2026-09-16",
  "2026-09-17",
  "2026-09-22",
  "2026-09-26",
  "2026-09-27",
  "2026-09-30",
];

async function swapNight(
  asg: { id: string; date: Date; startTime: string; agent: { lastName: string } }[],
  dateKey: string,
  fromLast: string,
  toId: string,
  toLast: string
) {
  const row = asg.find(
    (a) =>
      toDateKey(a.date) === dateKey &&
      a.startTime === "19:00" &&
      a.agent.lastName === fromLast
  );
  if (!row) {
    console.warn(`⚠ Nuit ${dateKey} ${fromLast} introuvable`);
    return;
  }
  await prisma.assignment.update({
    where: { id: row.id },
    data: { agentId: toId },
  });
  console.log(`✓ ${dateKey} nuit ${fromLast} → ${toLast}`);
}

async function swapDay(
  asg: { id: string; date: Date; startTime: string; endTime: string; agent: { lastName: string } }[],
  dateKey: string,
  startTime: string,
  endTime: string,
  fromLast: string,
  toId: string,
  toLast: string
) {
  const row = asg.find(
    (a) =>
      toDateKey(a.date) === dateKey &&
      a.startTime === startTime &&
      a.endTime === endTime &&
      a.agent.lastName === fromLast
  );
  if (!row) {
    console.warn(`⚠ Jour ${dateKey} ${startTime} ${fromLast} introuvable`);
    return;
  }
  await prisma.assignment.update({
    where: { id: row.id },
    data: { agentId: toId },
  });
  console.log(`✓ ${dateKey} ${startTime}-${endTime} ${fromLast} → ${toLast}`);
}

async function main() {
  const gemaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
  });
  const visage = await prisma.site.findFirst({
    where: { name: "VISAGE DU MONDE" },
  });
  const month = await prisma.planningMonth.findFirst({
    where: { year: 2026, month: 9 },
  });
  if (!gemaux || !month) throw new Error("Gémeaux / septembre introuvable");

  const agents = await prisma.agent.findMany();
  const byLast = new Map(agents.map((a) => [a.lastName, a]));
  const houngues = byLast.get("HOUNGUES")!;
  const dembele = byLast.get("DEMBELE")!;
  const seiti = byLast.get("SEITI")!;
  const halidi = byLast.get("HALIDI")!;
  const yahmadi = byLast.get("YAHMADI")!;

  await prisma.agent.update({
    where: { id: houngues.id },
    data: {
      overtimeAllowed: false,
      contractHours: 120,
      notes: "✅ Gémeaux — journée uniquement. Maximum 120 h, ne pas dépasser",
    },
  });
  await prisma.agent.update({
    where: { id: dembele.id },
    data: {
      overtimeAllowed: true,
      notes:
        "✅ Gémeaux journée uniquement (Ramata). Quelques vacations jour en plus, dépassement modéré OK",
    },
  });
  await prisma.agent.update({
    where: { id: halidi.id },
    data: {
      canWorkNight: true,
      dayOnly: false,
      nightForbidden: false,
      notes:
        "✅ VISAGE dimanches + quelques nuits Gémeaux. Campus Saint Christophe 07-19. Indispo 11–13/09",
    },
  });

  if (visage) {
    await prisma.agentSiteRule.deleteMany({ where: { agentId: halidi.id } });
    await prisma.agentSiteRule.createMany({
      data: [
        {
          agentId: halidi.id,
          siteId: visage.id,
          ruleType: "PREFERRED",
          allowedDays: ["SUNDAY"],
          notes: "VISAGE dimanches",
        },
        {
          agentId: halidi.id,
          siteId: gemaux.id,
          ruleType: "PREFERRED",
          fixedStartTime: "19:00",
          fixedEndTime: "07:00",
          notes: "Gémeaux nuits seulement",
        },
      ],
    });
  }

  await prisma.vacation.deleteMany({
    where: {
      agentId: halidi.id,
      startDate: { gte: new Date("2026-09-01T12:00:00.000Z") },
    },
  });
  await prisma.vacation.create({
    data: {
      agentId: halidi.id,
      startDate: new Date("2026-09-11T12:00:00.000Z"),
      endDate: new Date("2026-09-13T12:00:00.000Z"),
      reason: "Indisponible 11–13/09",
    },
  });

  await prisma.unavailableDate.deleteMany({ where: { agentId: halidi.id } });
  await prisma.unavailableDate.createMany({
    data: CAMPUS_DATES.map((date) => ({
      agentId: halidi.id,
      date: new Date(`${date}T12:00:00.000Z`),
      reason: "Campus Saint Christophe 07h–19h",
    })),
  });
  console.log("✓ HALIDI : Campus Saint Christophe + indispo 11–13");

  const gemAsg = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
  });

  await swapDay(gemAsg, "2026-09-27", "07:00", "19:00", "HOUNGUES", seiti.id, "SEITI");
  await swapDay(gemAsg, "2026-09-26", "08:00", "17:45", "DEMBELE", seiti.id, "SEITI");
  await swapDay(gemAsg, "2026-09-20", "07:00", "19:00", "DEMBELE", seiti.id, "SEITI");
  await swapDay(gemAsg, "2026-09-18", "07:00", "19:00", "DEMBELE", seiti.id, "SEITI");

  await swapNight(gemAsg, "2026-09-05", "YAHMADI", halidi.id, "HALIDI");
  await swapNight(gemAsg, "2026-09-18", "DJEDIA", halidi.id, "HALIDI");
  await swapNight(gemAsg, "2026-09-23", "DIAKITE", halidi.id, "HALIDI");
  await swapNight(gemAsg, "2026-09-28", "DIAKITE", halidi.id, "HALIDI");

  if (visage) {
    const vis27 = await prisma.assignment.findFirst({
      where: {
        siteId: visage.id,
        planningMonthId: month.id,
        agentId: halidi.id,
        date: { gte: new Date("2026-09-27T00:00:00.000Z"), lte: new Date("2026-09-27T23:59:59.000Z") },
      },
    });
    if (vis27) {
      await prisma.assignment.update({
        where: { id: vis27.id },
        data: { agentId: yahmadi.id },
      });
      console.log("✓ VISAGE 27 HALIDI → YAHMADI (Campus Saint Christophe)");
    }
  }

  const { validateSitePlanningGate } = await import(
    "../src/services/rules/validate-site-planning-gate"
  );
  const gGate = await validateSitePlanningGate(month.id, gemaux.id);
  console.log(
    gGate.canValidate ? "\n✓ Les Gémeaux validé" : `\n✗ Gémeaux: ${gGate.blockingMessages.join(" · ")}`
  );
  if (visage) {
    const vGate = await validateSitePlanningGate(month.id, visage.id);
    console.log(
      vGate.canValidate ? "✓ VISAGE validé" : `✗ VISAGE: ${vGate.blockingMessages.join(" · ")}`
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
