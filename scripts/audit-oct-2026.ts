import { prisma } from "../src/lib/db";
import { sumAssignmentHours } from "../src/lib/planning/hours";

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) {
    console.log("No October 2026 planning");
    return;
  }

  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  console.log("Sites:", sites.map((s) => s.name).join(", "));

  const names = ["CHARGUI", "KIBRI", "DJEDIA", "DIAKITE", "DEMBELE", "SEITI", "HOUNGUES", "EVINA", "DORCE"];
  const agents = await prisma.agent.findMany({
    where: {
      OR: names.map((ln) => ({ lastName: { contains: ln, mode: "insensitive" as const } })),
    },
    include: { siteRules: { where: { active: true }, include: { site: true } } },
  });

  console.log("\nAgents found:");
  for (const a of agents) {
    console.log(`- ${a.firstName} ${a.lastName} | ${a.contractHours}h | dayOnly=${a.dayOnly} nightForbidden=${a.nightForbidden} canWorkNight=${a.canWorkNight}`);
    for (const r of a.siteRules) {
      console.log(`    ${r.site.name} ${r.ruleType} days=${r.allowedDays.join(",")} ${r.fixedStartTime ?? ""}-${r.fixedEndTime ?? ""}`);
    }
  }

  const assignments = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id },
    include: { agent: true, site: true },
  });

  const byAgent = new Map<string, { hours: number; count: number; sites: Set<string> }>();
  for (const a of assignments) {
    const key = `${a.agent.lastName}`;
    const entry = byAgent.get(key) ?? { hours: 0, count: 0, sites: new Set<string>() };
    entry.hours += a.hours ?? 0;
    entry.count++;
    entry.sites.add(a.site.name);
    byAgent.set(key, entry);
  }

  console.log("\nOctober hours by agent:");
  for (const [name, v] of [...byAgent.entries()].sort((a, b) => b[1].hours - a[1].hours)) {
    console.log(`  ${name}: ${v.hours.toFixed(1)}h (${v.count} shifts) — ${[...v.sites].join(", ")}`);
  }

  const med = sites.find((s) => s.name.includes("Horloge") || s.name.includes("Médiath"));
  if (med) {
    const reqs = await prisma.siteRequirement.findMany({
      where: { siteId: med.id, active: true },
      orderBy: [{ specificDate: "asc" }, { startTime: "asc" }],
    });
    console.log(`\nMédiathèque requirements: ${reqs.length}`);
    for (const r of reqs.slice(0, 15)) {
      console.log(`  ${r.specificDate?.toISOString().slice(0, 10) ?? "recurring"} ${r.days.join(",")} ${r.startTime}-${r.endTime} ${r.label}`);
    }
    if (reqs.length > 15) console.log(`  ... +${reqs.length - 15}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
