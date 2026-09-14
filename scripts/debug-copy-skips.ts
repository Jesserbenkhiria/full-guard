import { PositionRole, PrismaClient } from "@prisma/client";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();
const AGENT_REMAP: Record<string, string> = { AOUFI: "CHARGUI", HALIDI: "" };

async function main() {
  const year = 2026;
  const srcMonth = 9;
  const dstMonth = 10;
  const [srcPm, dstPm] = await Promise.all([
    prisma.planningMonth.findFirst({ where: { year, month: srcMonth } }),
    prisma.planningMonth.findFirst({ where: { year, month: dstMonth } }),
  ]);
  const gemeaux = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!srcPm || !dstPm || !gemeaux) return;

  const srcRows = await prisma.assignment.findMany({
    where: { planningMonthId: srcPm.id, siteId: gemeaux.id },
    include: { agent: true },
  });
  const reqs = (
    await prisma.siteRequirement.findMany({ where: { siteId: gemeaux.id, active: true } })
  ).filter((r) => r.specificDate === null);

  function findReq(dateKey: string, a: (typeof srcRows)[0]) {
    const day = getDayOfWeek(parseDateKey(dateKey));
    return reqs.find(
      (r) =>
        r.startTime === a.startTime &&
        r.endTime === a.endTime &&
        (r.role ?? PositionRole.AGENT) === a.role &&
        r.shiftType === a.shiftType &&
        r.days.includes(day)
    );
  }

  const byReason = new Map<string, number>();
  for (const a of srcRows) {
    const srcDay = Number(toDateKey(a.date).slice(8, 10));
    const dstDateKey = `${year}-${String(dstMonth).padStart(2, "0")}-${String(srcDay).padStart(2, "0")}`;
    let ln = a.agent.lastName.toUpperCase();
    if (AGENT_REMAP[ln] !== undefined) {
      ln = AGENT_REMAP[ln];
      if (!ln) {
        byReason.set("remap-empty", (byReason.get("remap-empty") ?? 0) + 1);
        continue;
      }
    }
    if (!findReq(dstDateKey, a)) {
      const day = getDayOfWeek(parseDateKey(dstDateKey));
      const key = `noReq ${toDateKey(a.date)}→${dstDateKey} ${day} ${a.startTime}-${a.endTime} ${a.role} ${ln}`;
      byReason.set(key, (byReason.get(key) ?? 0) + 1);
    }
  }

  console.log("Source rows:", srcRows.length);
  for (const [k, v] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(v, k);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
