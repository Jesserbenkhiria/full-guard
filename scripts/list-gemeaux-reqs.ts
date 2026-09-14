import { prisma } from "../src/lib/db";

async function main() {
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!g) return;
  const r = await prisma.siteRequirement.findMany({ where: { siteId: g.id, active: true } });
  for (const x of r.filter((x) => x.specificDate === null)) {
    console.log(x.days.join(","), x.startTime, x.endTime, x.role, "x" + x.agentCount);
  }
}

main().finally(() => prisma.$disconnect());
