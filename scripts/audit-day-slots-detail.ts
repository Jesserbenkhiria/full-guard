import { PositionRole, PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

function isNight(start: string, end: string) {
  return end < start;
}

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const med = await prisma.site.findFirst({
    where: { OR: [{ name: { contains: "Horloge" } }, { name: { contains: "Médiath" } }] },
  });
  if (!pm || !g) return;

  for (const ln of ["DIAKITE", "CHARGUI"]) {
    const ag = await prisma.agent.findFirst({ where: { lastName: ln } });
    if (!ag) continue;
    const rows = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, siteId: g.id, agentId: ag.id },
      orderBy: { date: "asc" },
    });
    const days = rows.filter((r) => r.role === PositionRole.AGENT && !isNight(r.startTime, r.endTime));
    console.log(`${ln} — postes JOUR occupés: ${days.map((d) => toDateKey(d.date)).join(", ") || "aucun"}`);
  }

  if (med) {
    const kibri = await prisma.agent.findFirst({ where: { lastName: "KIBRI" } });
    if (kibri) {
      const rows = await prisma.assignment.findMany({
        where: { planningMonthId: pm.id, agentId: kibri.id },
        include: { site: true },
        orderBy: { date: "asc" },
      });
      console.log(`\nKIBRI — occupé: ${rows.map((r) => `${toDateKey(r.date)}(${r.site.name.slice(0, 6)})`).join(", ")}`);
    }
  }

  const nightFree: string[] = [];
  const reqs = (
    await prisma.siteRequirement.findMany({ where: { siteId: g.id, active: true } })
  ).filter((r) => r.specificDate === null && isNight(r.startTime, r.endTime));
  const rows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: g.id },
  });
  const filled = new Map<string, number>();
  for (const a of rows) {
    filled.set(
      `${toDateKey(a.date)}|${a.startTime}|${a.endTime}`,
      (filled.get(`${toDateKey(a.date)}|${a.startTime}|${a.endTime}`) ?? 0) + 1
    );
  }
  for (let d = 1; d <= 31; d++) {
    const dateKey = `2026-10-${String(d).padStart(2, "0")}`;
    for (const req of reqs) {
      const k = `${dateKey}|${req.startTime}|${req.endTime}`;
      if ((filled.get(k) ?? 0) < req.agentCount) nightFree.push(dateKey);
    }
  }
  console.log(`\nNuits libres: ${nightFree.join(", ")}`);
}

main().finally(() => prisma.$disconnect());
