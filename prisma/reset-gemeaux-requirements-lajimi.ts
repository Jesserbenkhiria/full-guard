/**
 * Rétablit les postes Les Gémeaux (spec Lajimi) — identiques tous les mois.
 * Corrige agentCount ×3 erroné sur le bandeau jour lun–ven (doit être ×2 → ~108 postes / sept.).
 *
 * Run: npx tsx prisma/reset-gemeaux-requirements-lajimi.ts
 */
import { PositionRole, PrismaClient } from "@prisma/client";
import {
  GEMEAUX_REQUIREMENTS,
  toRequirementCreateData,
} from "./site-requirements-lajimi";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

async function remapAssignments(siteId: string) {
  const reqs = await prisma.siteRequirement.findMany({
    where: { siteId, active: true },
  });
  const recurring = reqs.filter((r) => r.specificDate === null);

  function findReq(a: {
    date: Date;
    startTime: string;
    endTime: string;
    role: PositionRole;
    shiftType: string;
  }) {
    const day = getDayOfWeek(a.date);
    return recurring.find(
      (r) =>
        r.startTime === a.startTime &&
        r.endTime === a.endTime &&
        (r.role ?? PositionRole.AGENT) === a.role &&
        r.shiftType === a.shiftType &&
        r.days.includes(day)
    );
  }

  const months = await prisma.planningMonth.findMany({
    where: { year: 2026, month: { in: [9, 10] } },
  });

  let fixed = 0;
  let orphan = 0;
  for (const pm of months) {
    const rows = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, siteId },
    });
    for (const a of rows) {
      const req = findReq(a);
      if (!req) {
        orphan++;
        continue;
      }
      if (a.requirementId !== req.id) {
        await prisma.assignment.update({
          where: { id: a.id },
          data: { requirementId: req.id },
        });
        fixed++;
      }
    }
  }
  console.log(`✓ requirementId: ${fixed} corrigés, ${orphan} sans poste récurrent (conservés)`);
}

async function main() {
  const gemeaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
  });
  if (!gemeaux) {
    console.error("Site Gémeaux introuvable");
    process.exit(1);
  }

  await prisma.siteRequirement.deleteMany({ where: { siteId: gemeaux.id } });
  await prisma.siteRequirement.createMany({
    data: GEMEAUX_REQUIREMENTS.map((req) => ({
      siteId: gemeaux.id,
      ...toRequirementCreateData(req),
    })),
  });

  console.log(`✓ ${GEMEAUX_REQUIREMENTS.length} postes Gémeaux (spec Lajimi — lun–ven ×2 agents jour, plus sam. 08h–17h45)`);

  await remapAssignments(gemeaux.id);

  for (const month of [9, 10]) {
    const last = month === 9 ? 30 : 31;
    const reqs = (
      await prisma.siteRequirement.findMany({
        where: { siteId: gemeaux.id, active: true },
      })
    ).filter((r) => r.specificDate === null);
    let total = 0;
    for (let day = 1; day <= last; day++) {
      const d = parseDateKey(
        `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      );
      const dow = getDayOfWeek(d);
      for (const req of reqs) {
        if (req.days.includes(dow)) total += req.agentCount;
      }
    }
    console.log(`  → ${month}/2026: ${total} postes requis`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
