import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

async function main() {
  const ln = process.argv[2] ?? "YAHMADI";
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const ag = await prisma.agent.findFirst({
    where: { lastName: { equals: ln, mode: "insensitive" } },
  });
  if (!pm || !ag) return;
  const rows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, agentId: ag.id },
    include: { site: true },
    orderBy: { date: "asc" },
  });
  for (const r of rows) {
    console.log(`${toDateKey(r.date)} ${r.site.name.padEnd(22)} ${r.startTime}-${r.endTime} ${r.role}`);
  }
  console.log(`Total: ${rows.length} vac, ${rows.reduce((s, r) => s + (r.hours ?? 0), 0)} h`);
}

main().finally(() => prisma.$disconnect());
