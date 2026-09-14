import { DayOfWeek, PositionRole, PrismaClient } from "@prisma/client";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!pm || !g) return;

  const reqs = (
    await prisma.siteRequirement.findMany({ where: { siteId: g.id, active: true } })
  ).filter((r) => r.specificDate === null);

  for (const ln of ["SEITI", "DJEDIA"]) {
    const ag = await prisma.agent.findFirst({ where: { lastName: ln } });
    if (!ag) continue;
    const rows = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, siteId: g.id, agentId: ag.id },
    });
    const shorts = rows.filter(
      (r) => r.startTime === "08:00" && r.endTime === "17:45"
    );
    console.log(`${ln}: ${shorts.length} créneau(x) court(s)`);
    for (const s of shorts) {
      const day = getDayOfWeek(s.date);
      const longReq = reqs.find(
        (r) =>
          r.days.includes(day) &&
          r.role === PositionRole.AGENT &&
          r.startTime === "07:00" &&
          r.endTime === "19:00"
      );
      if (!longReq) continue;
      const dk = toDateKey(s.date);
      const filled = await prisma.assignment.count({
        where: {
          planningMonthId: pm.id,
          siteId: g.id,
          date: s.date,
          startTime: "07:00",
          endTime: "19:00",
          role: PositionRole.AGENT,
        },
      });
      const weekdayReq = reqs.find(
        (r) =>
          r.role === PositionRole.AGENT &&
          r.startTime === "07:00" &&
          r.endTime === "19:00" &&
          r.days.includes(DayOfWeek.MONDAY)
      );
      const targetReq = filled >= longReq.agentCount ? weekdayReq : longReq;
      if (!targetReq) continue;

      if (filled >= longReq.agentCount) {
        for (const dateKey of Array.from({ length: 31 }, (_, i) =>
          `2026-10-${String(i + 1).padStart(2, "0")}`
        )) {
          if (dateKey === dk) continue;
          const d = getDayOfWeek(parseDateKey(dateKey));
          if (!targetReq.days.includes(d)) continue;
          const busy = await prisma.assignment.count({
            where: { planningMonthId: pm.id, agentId: ag.id, date: parseDateKey(dateKey) },
          });
          if (busy) continue;
          const slotFull = await prisma.assignment.count({
            where: {
              planningMonthId: pm.id,
              siteId: g.id,
              date: parseDateKey(dateKey),
              startTime: "07:00",
              endTime: "19:00",
              role: PositionRole.AGENT,
            },
          });
          if (slotFull >= targetReq.agentCount) continue;
          await prisma.assignment.delete({ where: { id: s.id } });
          await prisma.assignment.create({
            data: {
              planningMonthId: pm.id,
              agentId: ag.id,
              siteId: g.id,
              requirementId: targetReq.id,
              date: parseDateKey(dateKey),
              shiftType: s.shiftType,
              role: PositionRole.AGENT,
              startTime: "07:00",
              endTime: "19:00",
              hours: 12,
              notes: `fix-short ${ln}`,
            },
          });
          console.log(`✓ ${ln}: ${dk} 08-17h45 → ${dateKey} 07-19`);
          break;
        }
        // Aucun jour libre : passer en 07h–19h (2e agent samedi — affiché en surplus UI)
        const satReq = reqs.find(
          (r) =>
            r.days.includes(getDayOfWeek(s.date)) &&
            r.role === PositionRole.AGENT &&
            r.startTime === "07:00" &&
            r.endTime === "19:00"
        );
        if (satReq) {
          await prisma.assignment.update({
            where: { id: s.id },
            data: {
              startTime: "07:00",
              endTime: "19:00",
              hours: 12,
              requirementId: satReq.id,
              notes: `fix-short sat 07-19 ${ln}`,
            },
          });
          console.log(`✓ ${ln}: ${dk} 08-17h45 → 07-19 (samedi, quota heures)`);
        }
      } else {
        await prisma.assignment.update({
          where: { id: s.id },
          data: {
            startTime: "07:00",
            endTime: "19:00",
            hours: 12,
            requirementId: longReq.id,
            notes: `fix-short same-day ${ln}`,
          },
        });
        console.log(`✓ ${ln}: ${dk} passé en 07-19 (même jour)`);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
