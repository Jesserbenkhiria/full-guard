import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const gem = await p.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!gem) { console.log("No Gémeaux site"); return; }

  const reqs = await p.siteRequirement.findMany({ where: { siteId: gem.id }, orderBy: { startTime: "asc" } });
  console.log(`Gémeaux: ${reqs.length} requirements total`);
  for (const r of reqs) {
    console.log(`  ${r.active ? "✓" : "✗"} ${r.role.padEnd(12)} ${r.shiftType.padEnd(7)} ${r.startTime}-${r.endTime}  agentCount=${r.agentCount}  days=${r.days.join(",") || "(none)"}  specificDate=${r.specificDate ? r.specificDate.toISOString().slice(0,10) : "null"}`);
  }
}

main().catch(console.error).finally(() => p.$disconnect());
