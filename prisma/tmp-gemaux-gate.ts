import { PrismaClient } from "@prisma/client";
import { validateSitePlanningGate } from "../src/services/rules/validate-site-planning-gate";

const prisma = new PrismaClient();
async function main() {
  const gemaux = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  if (!gemaux || !month) return;
  const gate = await validateSitePlanningGate(month.id, gemaux.id);
  console.log(JSON.stringify(gate, null, 2));
}
main().finally(() => prisma.$disconnect());
