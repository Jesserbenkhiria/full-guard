import { prisma } from "../src/lib/db";
import { toDateKey, getDayOfWeek } from "../src/lib/planning/dates";
import { assignmentsMatchSlot } from "../src/lib/planning/shift-templates";

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) return;

  const gem = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
    include: { requirements: { where: { active: true } } },
  });
  if (!gem) return;

  const assignments = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: gem.id },
  });
  const dtos = assignments.map((a) => ({
    siteId: a.siteId,
    date: toDateKey(a.date),
    startTime: a.startTime,
    endTime: a.endTime,
    requirementId: a.requirementId,
    role: a.role,
  }));

  const gaps: { date: string; label: string; role: string; shift: string; need: number }[] = [];

  for (const req of gem.requirements) {
    if (req.specificDate) continue;
    for (let d = 1; d <= 31; d++) {
      const day = new Date(Date.UTC(2026, 9, d, 12));
      const dateKey = toDateKey(day);
      if (!req.days.includes(getDayOfWeek(day))) continue;

      const slot = {
        siteId: gem.id,
        date: dateKey,
        startTime: req.startTime,
        endTime: req.endTime,
        requirementId: req.id,
        role: req.role ?? "AGENT",
      };
      const matching = dtos.filter((a) => assignmentsMatchSlot(a, slot));
      const need = req.agentCount - matching.length;
      if (need > 0) {
        gaps.push({
          date: dateKey,
          label: req.label ?? `${req.startTime}-${req.endTime}`,
          role: req.role ?? "AGENT",
          shift: req.shiftType,
          need,
        });
      }
    }
  }

  gaps.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`Gaps: ${gaps.length} rows, ${gaps.reduce((s, g) => s + g.need, 0)} slots`);
  for (const g of gaps) {
    console.log(`  ${g.date} ${g.role} ${g.shift} ${g.label} ×${g.need}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
