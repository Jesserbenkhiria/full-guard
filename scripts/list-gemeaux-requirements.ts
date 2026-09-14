import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

async function main() {
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!g) return;
  const reqs = await prisma.siteRequirement.findMany({ where: { siteId: g.id } });
  for (const r of reqs) {
    console.log(
      `${r.active ? "✓" : "✗"} ${r.startTime}-${r.endTime} ${String(r.role).padEnd(12)} ×${r.agentCount} ${r.shiftType.padEnd(6)} ${r.specificDate ? `[${toDateKey(r.specificDate)}]` : r.days.map((d) => d.slice(0, 3)).join(",")} — ${r.label ?? ""}`
    );
  }
}

main().finally(() => prisma.$disconnect());
