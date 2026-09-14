import { prisma } from "../src/lib/db";
import { toDateKey, getDayOfWeek } from "../src/lib/planning/dates";

const month = Number(process.argv[2] ?? 9);
const year = Number(process.argv[3] ?? 2026);

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year, month } });
  if (!pm) {
    console.log(`No planning ${year}-${month}`);
    return;
  }
  const gem = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!gem) return;

  const rows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: gem.id },
    include: { agent: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  console.log(`\n=== Gémeaux ${year}-${String(month).padStart(2, "0")} : ${rows.length} affectations ===\n`);

  const bySlot = new Map<string, typeof rows>();
  for (const a of rows) {
    const dk = toDateKey(a.date);
    const key = `${dk}|${a.startTime}|${a.endTime}|${a.role}|${a.shiftType}`;
    const list = bySlot.get(key) ?? [];
    list.push(a);
    bySlot.set(key, list);
  }

  for (const [key, list] of [...bySlot.entries()].sort()) {
    const [dk, st, et, role, stype] = key.split("|");
    const day = getDayOfWeek(new Date(dk + "T12:00:00.000Z"));
    const agents = list.map((a) => a.agent.lastName).join(", ");
    console.log(`${dk} ${day.slice(0, 3)} ${st}-${et} ${role} ${stype} → ${agents}`);
  }

  const byAgent = new Map<string, number>();
  for (const a of rows) {
    byAgent.set(a.agent.lastName, (byAgent.get(a.agent.lastName) ?? 0) + 1);
  }
  console.log("\n--- Par agent ---");
  for (const [n, c] of [...byAgent.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}: ${c} vac`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
