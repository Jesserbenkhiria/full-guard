import { prisma } from "../src/lib/db";

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) { console.log("No PM oct 2026"); return; }
  console.log("PM id:", pm.id, "status:", pm.status);

  const spms = await prisma.sitePlanningMonth.findMany({
    where: { planningMonthId: pm.id },
    include: { site: true },
  });
  console.log("SitePlanningMonths:", spms.length);
  for (const s of spms) console.log(" -", s.site.name, s.status);

  const med = await prisma.site.findFirst({ where: { name: { contains: "Horloge" } } });
  console.log("Med site:", med ? `${med.name} / ${med.id}` : "NOT FOUND");

  if (med) {
    const hasSpm = spms.find((s) => s.siteId === med.id);
    console.log("Med SitePlanningMonth:", hasSpm ? hasSpm.status : "MISSING");

    const asgn = await prisma.assignment.findMany({
      where: { siteId: med.id, planningMonthId: pm.id },
      orderBy: { date: "asc" },
    });
    console.log("Med assignments:", asgn.length);
    for (const a of asgn) {
      console.log(" ", a.date.toISOString().slice(0, 10), a.startTime, a.endTime, a.hours);
    }

    const reqs = await prisma.siteRequirement.findMany({ where: { siteId: med.id, active: true } });
    console.log("Med requirements (active):", reqs.length);
    for (const r of reqs) {
      const sd = r.specificDate ? r.specificDate.toISOString().slice(0, 10) : "recurring";
      console.log(" ", sd, r.days.join(","), r.startTime, r.endTime);
    }
  }

  // LAJIMI days
  const lajimi = await prisma.agent.findFirst({ where: { lastName: "LAJIMI" } });
  if (lajimi) {
    const rules = await prisma.agentSiteRule.findMany({ where: { agentId: lajimi.id } });
    console.log("\nLAJIMI rules:");
    for (const r of rules) console.log(" ", r.allowedDays.join(","), r.fixedStartTime, r.fixedEndTime);
  }

  // HALIDI
  const halidi = await prisma.agent.findFirst({ where: { lastName: { contains: "HALIDI", mode: "insensitive" } } });
  console.log("\nHALIDI:", halidi ? `active=${halidi.active}` : "NOT FOUND");

  // DORCE vacation
  const dorce = await prisma.agent.findFirst({ where: { lastName: "DORCE" } });
  if (dorce) {
    const vac = await prisma.vacation.findMany({ where: { agentId: dorce.id } });
    console.log("\nDORCE vacations:");
    for (const v of vac) console.log(" ", v.startDate.toISOString().slice(0,10), "→", v.endDate.toISOString().slice(0,10));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
