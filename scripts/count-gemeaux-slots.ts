import { prisma } from "../src/lib/db";
import { getDayOfWeek, getMonthDays, toDateKey } from "../src/lib/planning/dates";
import { GEMEAUX_REQUIREMENTS } from "../prisma/site-requirements-lajimi";

function countFromReqs(
  reqs: { days: string[]; agentCount: number; specificDate?: Date | null }[],
  month: number
) {
  const days = getMonthDays(2026, month);
  let total = 0;
  for (const req of reqs) {
    if (req.specificDate) continue;
    for (const d of days) {
      if (req.days.includes(getDayOfWeek(d))) total += req.agentCount;
    }
  }
  return total;
}

async function main() {
  const month = Number(process.argv[2] ?? 10);
  if (process.argv.includes("--seed")) {
    console.log(`Gémeaux ${month}/2026 (fichier GEMEAUX_REQUIREMENTS): ${countFromReqs(GEMEAUX_REQUIREMENTS, month)} postes`);
    return;
  }
  const gem = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
    include: { requirements: { where: { active: true } } },
  });
  if (!gem) return;

  const days = getMonthDays(2026, month);
  let total = 0;
  for (const req of gem.requirements) {
    if (req.specificDate) {
      const dk = toDateKey(req.specificDate);
      if (dk.startsWith(`2026-${String(month).padStart(2, "0")}`)) {
        total += req.agentCount;
      }
      continue;
    }
    for (const d of days) {
      if (req.days.includes(getDayOfWeek(d))) total += req.agentCount;
    }
  }

  console.log(`Gémeaux ${month}/2026 — postes requis (UI): ${total}`);
  console.log(`  Templates actifs: ${gem.requirements.length}`);
  for (const r of gem.requirements) {
    console.log(
      `  · ${r.label ?? "?"} | ${r.startTime}-${r.endTime} | ${r.role} | ×${r.agentCount} | days=${r.days.join(",")}${r.specificDate ? " | DATE" : ""}`
    );
  }
}

main().finally(() => prisma.$disconnect());
