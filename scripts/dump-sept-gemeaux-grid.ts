import { prisma } from "../src/lib/db";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";

const DOW3 = {
  MONDAY: "lun",
  TUESDAY: "mar",
  WEDNESDAY: "mer",
  THURSDAY: "jeu",
  FRIDAY: "ven",
  SATURDAY: "sam",
  SUNDAY: "dim",
} as const;

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  const gem = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!pm || !gem) return;

  const reqs = await prisma.siteRequirement.findMany({ where: { siteId: gem.id, active: true } });
  const rows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: gem.id },
    include: { agent: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  for (let d = 1; d <= 30; d++) {
    const dk = `2026-09-${String(d).padStart(2, "0")}`;
    const date = parseDateKey(dk);
    const dow = getDayOfWeek(date);
    const specific = reqs.filter((r) => r.specificDate && toDateKey(r.specificDate) === dk);
    const masked = new Set(specific.map((r) => `${r.startTime}-${r.endTime}`));
    const recurring = reqs.filter(
      (r) => !r.specificDate && r.days.includes(dow) && !masked.has(`${r.startTime}-${r.endTime}`)
    );
    const dayReqs = [...specific, ...recurring];
    const dayRows = rows.filter((a) => toDateKey(a.date) === dk);
    const need = dayReqs.reduce((s, r) => s + r.agentCount, 0);
    const parts = dayRows.map(
      (a) =>
        `${a.agent.lastName.toUpperCase()}${a.role === "TEAM_LEADER" ? "*" : ""} ${a.startTime}-${a.endTime}`
    );
    console.log(
      `${dk} ${DOW3[dow]}  need=${need} got=${dayRows.length}  | ${parts.join(" | ")}`
    );
  }

  const byAgent = new Map<string, { n: number; h: number; nights: number }>();
  for (const r of rows) {
    const ln = r.agent.lastName.toUpperCase();
    const s = byAgent.get(ln) ?? { n: 0, h: 0, nights: 0 };
    s.n++;
    s.h += r.hours ?? calculateShiftHours(r.startTime, r.endTime);
    if (r.shiftType === "NIGHT") s.nights++;
    byAgent.set(ln, s);
  }
  console.log("\n--- Sept hours ---");
  for (const [ln, s] of [...byAgent.entries()].sort((a, b) => b[1].h - a[1].h)) {
    console.log(`  ${ln.padEnd(12)} ${s.h.toFixed(1).padStart(6)} h  (${s.n} vac, ${s.nights} nuit)`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
