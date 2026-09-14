import { PositionRole, PrismaClient } from "@prisma/client";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();
const OCT = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

function isNight(start: string, end: string) {
  return end < start;
}

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!pm || !g) return;

  const reqs = (
    await prisma.siteRequirement.findMany({ where: { siteId: g.id, active: true } })
  ).filter((r) => r.specificDate === null);

  let dayAgentCap = 0;
  let nightAgentCap = 0;
  let tlCap = 0;
  for (const dateKey of OCT) {
    const day = getDayOfWeek(parseDateKey(dateKey));
    for (const req of reqs) {
      if (!req.days.includes(day)) continue;
      const role = req.role ?? PositionRole.AGENT;
      if (role === PositionRole.TEAM_LEADER) tlCap += req.agentCount;
      else if (isNight(req.startTime, req.endTime)) nightAgentCap += req.agentCount;
      else dayAgentCap += req.agentCount;
    }
  }
  console.log(`Capacité — AGENT jour: ${dayAgentCap}, AGENT nuit: ${nightAgentCap}, CHEF: ${tlCap}`);

  const rows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: g.id },
    include: { agent: true },
  });

  type Stat = { day: number; night: number; tl: number; h: number };
  const byAgent = new Map<string, Stat>();
  for (const a of rows) {
    const ln = a.agent.lastName.toUpperCase();
    const s = byAgent.get(ln) ?? { day: 0, night: 0, tl: 0, h: 0 };
    if (a.role === PositionRole.TEAM_LEADER) s.tl++;
    else if (isNight(a.startTime, a.endTime)) s.night++;
    else s.day++;
    s.h += a.hours ?? calculateShiftHours(a.startTime, a.endTime);
    byAgent.set(ln, s);
  }

  console.log("\nAgent        jour  nuit  chef  heures");
  let totDay = 0;
  for (const [ln, s] of [...byAgent.entries()].sort((a, b) => b[1].h - a[1].h)) {
    totDay += s.day;
    console.log(
      `  ${ln.padEnd(10)} ${String(s.day).padStart(4)} ${String(s.night).padStart(5)} ${String(s.tl).padStart(5)} ${s.h.toFixed(1).padStart(7)}`
    );
  }
  console.log(`\nPostes AGENT jour utilisés: ${totDay}/${dayAgentCap}`);

  const over = new Map<string, number>();
  for (const a of rows) {
    const k = `${toDateKey(a.date)}|${a.startTime}|${a.endTime}|${a.role}`;
    over.set(k, (over.get(k) ?? 0) + 1);
  }
  console.log("\nSurcapacité (plus d'agents que requis):");
  let surplus = 0;
  for (const dateKey of OCT) {
    const day = getDayOfWeek(parseDateKey(dateKey));
    for (const req of reqs) {
      if (!req.days.includes(day)) continue;
      const role = req.role ?? PositionRole.AGENT;
      const k = `${dateKey}|${req.startTime}|${req.endTime}|${role}`;
      const n = over.get(k) ?? 0;
      if (n > req.agentCount) {
        surplus += n - req.agentCount;
        const who = rows
          .filter(
            (a) =>
              toDateKey(a.date) === dateKey &&
              a.startTime === req.startTime &&
              a.endTime === req.endTime &&
              a.role === role
          )
          .map((a) => a.agent.lastName)
          .join(", ");
        console.log(`  ${dateKey} ${req.startTime}-${req.endTime} ${role}: ${n}/${req.agentCount} (${who})`);
      }
    }
  }
  if (!surplus) console.log("  (aucune)");
}

main().finally(() => prisma.$disconnect());
