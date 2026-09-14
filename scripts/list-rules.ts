import { prisma } from "../src/lib/db";

async function main() {
  const rules = await prisma.rule.findMany({ orderBy: { code: "asc" } });
  for (const r of rules) {
    console.log(`${r.enabled ? "ON " : "off"} ${r.severity.padEnd(7)} ${r.code}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
