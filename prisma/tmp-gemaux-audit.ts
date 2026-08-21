import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { isWeekendDay, weekendPeriodKey } from "../src/lib/planning/weekends";

const prisma = new PrismaClient();
const DOW = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

async function main() {
  const gemaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
    include: { requirements: { where: { active: true } } },
  });
  const douze = await prisma.site.findFirst({ where: { name: { contains: "DOUZE" } } });
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  if (!gemaux || !month) return;

  console.log("--- Exigences Gémeaux ---");
  for (const r of gemaux.requirements) {
    console.log(
      `${r.role} ${r.shiftType} ${r.startTime}-${r.endTime} x${r.agentCount} days=${r.days.join(",")}`
    );
  }

  const asg = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
    include: { agent: true },
    orderBy: { date: "asc" },
  });

  const byDate = new Map<string, typeof asg>();
  for (const a of asg) {
    const k = toDateKey(a.date);
    const list = byDate.get(k) ?? [];
    list.push(a);
    byDate.set(k, list);
  }

  console.log("\n--- Planning jour par jour ---");
  for (let d = 1; d <= 30; d++) {
    const key = `2026-09-${String(d).padStart(2, "0")}`;
    const date = new Date(`${key}T12:00:00.000Z`);
    const slots = (byDate.get(key) ?? []).sort((a, b) =>
      a.startTime.localeCompare(b.startTime) || a.role.localeCompare(b.role)
    );
    const line = slots
      .map(
        (s) =>
          `${s.role === "TEAM_LEADER" ? "CHEF" : "AGT"} ${s.startTime}-${s.endTime} ${s.agent.lastName}`
      )
      .join(" | ");
    console.log(`${key} ${DOW[date.getUTCDay()]}  ${line || "(vide)"}`);
  }

  console.log("\n--- Par agent ---");
  const byAgent = new Map<string, typeof asg>();
  for (const a of asg) {
    const list = byAgent.get(a.agent.lastName) ?? [];
    list.push(a);
    byAgent.set(a.agent.lastName, list);
  }
  for (const [name, list] of [...byAgent.entries()].sort()) {
    const we = new Set<string>();
    let h = 0;
    const nights = list.filter((a) => a.shiftType === "NIGHT" || a.startTime === "19:00").length;
    const days = list.length - nights;
    for (const a of list) {
      h += a.hours ?? calculateShiftHours(a.startTime, a.endTime);
      if (isWeekendDay(a.date)) we.add(weekendPeriodKey(a.date));
    }
    console.log(
      `${name.padEnd(10)} ${String(list.length).padStart(2)} vac  ${Math.round(h * 10) / 10}h  ${days}j/${nights}n  ${we.size} WE`
    );
  }

  if (douze) {
    const evina = await prisma.agent.findFirst({ where: { lastName: "EVINA" } });
    if (evina) {
      const evinaDouze = await prisma.assignment.findMany({
        where: { agentId: evina.id, siteId: douze.id, planningMonthId: month.id },
        orderBy: { date: "asc" },
      });
      console.log("\n--- EVINA LE DOUZE ---");
      for (const a of evinaDouze) {
        console.log(
          `${toDateKey(a.date)} ${DOW[a.date.getUTCDay()]} ${a.startTime}-${a.endTime}`
        );
      }
      const vacs = await prisma.vacation.findMany({ where: { agentId: evina.id } });
      console.log("congés:", vacs.map((v) => `${toDateKey(v.startDate)}→${toDateKey(v.endDate)}`).join(" ; "));
    }
  }
}

main().finally(() => prisma.$disconnect());
