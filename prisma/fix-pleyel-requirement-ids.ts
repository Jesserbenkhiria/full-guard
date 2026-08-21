/**
 * Relink PLEYEL assignments to current site requirements
 * (requirement IDs were recreated by migrate-lajimi-spec without rematch).
 *
 * Run: npx tsx prisma/fix-pleyel-requirement-ids.ts
 */
import { PrismaClient } from "@prisma/client";
import { getDayOfWeek, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

async function main() {
  const pleyel = await prisma.site.findFirst({
    where: { name: "PLEYEL" },
    include: { requirements: { where: { active: true } } },
  });
  if (!pleyel) throw new Error("PLEYEL introuvable");

  const assignments = await prisma.assignment.findMany({
    where: { siteId: pleyel.id },
  });

  const reqIds = new Set(pleyel.requirements.map((r) => r.id));
  let linked = 0;
  let missing = 0;

  for (const assignment of assignments) {
    if (assignment.requirementId && reqIds.has(assignment.requirementId)) {
      continue;
    }
    const req = pleyel.requirements.find(
      (r) =>
        r.startTime === assignment.startTime &&
        r.endTime === assignment.endTime &&
        r.days.includes(getDayOfWeek(assignment.date))
    );
    if (!req) {
      console.warn(
        `! ${toDateKey(assignment.date)} ${assignment.startTime}–${assignment.endTime} : pas d'exigence`
      );
      missing++;
      continue;
    }
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { requirementId: req.id },
    });
    linked++;
  }

  console.log(`✓ PLEYEL : ${linked} affectations recollées, ${missing} sans créneau`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
