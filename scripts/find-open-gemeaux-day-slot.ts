import { PositionRole, PrismaClient } from "@prisma/client";
import { getDayOfWeek, parseDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();
const OCT = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

async function main() {
  const ln = process.argv[2] ?? "SEITI";
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const ag = await prisma.agent.findFirst({ where: { lastName: ln } });
  if (!pm || !g || !ag) return;

  const reqs = (
    await prisma.siteRequirement.findMany({ where: { siteId: g.id, active: true } })
  ).filter((r) => r.specificDate === null);
  const dayReq = reqs.find(
    (r) =>
      r.startTime === "07:00" &&
      r.endTime === "19:00" &&
      r.role === PositionRole.AGENT &&
      r.days.includes("MONDAY" as never)
  );
  if (!dayReq) return;

  for (const dateKey of OCT) {
    const busy = await prisma.assignment.count({
      where: { planningMonthId: pm.id, agentId: ag.id, date: parseDateKey(dateKey) },
    });
    if (busy) continue;
    const d = getDayOfWeek(parseDateKey(dateKey));
    if (!dayReq.days.includes(d)) continue;
    const filled = await prisma.assignment.count({
      where: {
        planningMonthId: pm.id,
        siteId: g.id,
        date: parseDateKey(dateKey),
        startTime: "07:00",
        endTime: "19:00",
        role: PositionRole.AGENT,
      },
    });
    if (filled < dayReq.agentCount) {
      console.log("OPEN", dateKey, d, `${filled}/${dayReq.agentCount}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
