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
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const gem = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!pm || !gem) return;

  const reqs = await prisma.siteRequirement.findMany({ where: { siteId: gem.id, active: true } });
  const rows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: gem.id },
    include: { agent: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  let required = 0;
  let openTotal = 0;

  for (let d = 1; d <= 31; d++) {
    const dk = `2026-10-${String(d).padStart(2, "0")}`;
    const date = parseDateKey(dk);
    const dow = getDayOfWeek(date);

    // Same masking logic as the app: a specificDate requirement overrides recurring ones
    // sharing the same time band.
    const specific = reqs.filter((r) => r.specificDate && toDateKey(r.specificDate) === dk);
    const masked = new Set(specific.map((r) => `${r.startTime}-${r.endTime}`));
    const recurring = reqs.filter(
      (r) => !r.specificDate && r.days.includes(dow) && !masked.has(`${r.startTime}-${r.endTime}`)
    );
    const dayReqs = [...specific, ...recurring];

    const dayRows = rows.filter((a) => toDateKey(a.date) === dk);
    const need = dayReqs.reduce((s, r) => s + r.agentCount, 0);
    required += need;
    const open = need - dayRows.length;
    openTotal += open;

    const parts = dayRows.map(
      (a) =>
        `${a.agent.lastName.toUpperCase()}${a.role === "TEAM_LEADER" ? "*" : ""} ${a.startTime}-${a.endTime}`
    );
    console.log(
      `${dk} ${DOW3[dow]}  need=${need} got=${dayRows.length}${open > 0 ? ` OPEN=${open}` : ""}  | ${parts.join(" | ")}`
    );
  }

  console.log(`\nrequired=${required} filled=${rows.length} open=${openTotal}`);

  const tlRows = rows.filter((a) => a.role === "TEAM_LEADER");
  const tlBy = new Map<string, number>();
  for (const a of tlRows) {
    const ln = a.agent.lastName.toUpperCase();
    tlBy.set(ln, (tlBy.get(ln) ?? 0) + 1);
  }
  console.log("\nTEAM_LEADER slots filled by:", [...tlBy.entries()].map(([k, v]) => `${k}=${v}`).join(", "));

  const totalHours = rows.reduce(
    (s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)),
    0
  );
  console.log(`total assigned hours=${totalHours.toFixed(1)}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
