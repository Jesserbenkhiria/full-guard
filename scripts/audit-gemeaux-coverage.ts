import { prisma } from "../src/lib/db";
import { expandRequirementsForMonth } from "../src/lib/planning/shift-templates";
import { toDateKey } from "../src/lib/planning/dates";

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) return;

  const gem = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
    include: { requirements: { where: { active: true } } },
  });
  if (!gem) return;

  const slots = expandRequirementsForMonth(gem.requirements, 2026, 10);
  const assignments = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: gem.id },
    include: { agent: true },
  });

  const matched = new Set<string>();
  for (const a of assignments) {
    const k = `${toDateKey(a.date)}|${a.startTime}|${a.endTime}|${a.role}`;
    matched.add(k + "|" + a.agentId);
  }

  // Count slots vs filled (by requirement slot capacity)
  let totalSlots = 0;
  let filledSlots = 0;
  const emptyByDate = new Map<string, number>();

  for (const slot of slots) {
    totalSlots += slot.agentCount;
    const onDate = assignments.filter(
      (a) =>
        toDateKey(a.date) === slot.dateKey &&
        a.startTime === slot.startTime &&
        a.endTime === slot.endTime &&
        a.role === slot.role
    );
    filledSlots += Math.min(onDate.length, slot.agentCount);
    const gap = slot.agentCount - onDate.length;
    if (gap > 0) {
      emptyByDate.set(slot.dateKey, (emptyByDate.get(slot.dateKey) ?? 0) + gap);
    }
  }

  console.log(`Gémeaux Oct 2026: ${filledSlots}/${totalSlots} postes pourvus (${totalSlots - filledSlots} vacants)`);
  console.log(`Assignments on site: ${assignments.length}`);

  const after17 = [...emptyByDate.entries()].filter(([d]) => d >= "2026-10-18").sort();
  const vacAfter17 = after17.reduce((s, [, n]) => s + n, 0);
  console.log(`Vacants from 18/10: ${vacAfter17} postes on ${after17.length} days with gaps`);

  // Agent violations quick check
  for (const name of ["DIAKITE", "LAJIMI", "CHARGUI", "DORCE", "EVINA"]) {
    const list = assignments.filter((a) => a.agent.lastName.toUpperCase() === name);
    const h = list.reduce((s, a) => s + (a.hours ?? 0), 0);
    console.log(`\n${name}: ${list.length} vac, ${h.toFixed(1)}h`);
    for (const a of list.sort((x, y) => toDateKey(x.date).localeCompare(toDateKey(y.date)))) {
      console.log(`  ${toDateKey(a.date)} ${a.startTime}-${a.endTime} ${a.shiftType} ${a.role}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
