import { PrismaClient } from "@prisma/client";
import { validateAllSitesPlanningGate } from "../src/services/rules/validate-site-planning-gate";

const prisma = new PrismaClient();

async function main() {
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  if (!month) return;
  const rules = await prisma.agentSiteRule.count();
  console.log("AgentSiteRule count:", rules);
  for (const name of ["Gémeaux", "VISAGE", "PLEYEL", "LE DOUZE"]) {
    const site = await prisma.site.findFirst({ where: { name: { contains: name } } });
    const c = await prisma.assignment.count({
      where: { siteId: site!.id, planningMonthId: month.id },
    });
    console.log(`${name}: ${c} assignments`);
  }
  const result = await validateAllSitesPlanningGate(month.id);
  console.log("Mois validable:", result.canValidateMonth);
  for (const sr of result.siteResults) {
    const site = await prisma.site.findUnique({ where: { id: sr.siteId } });
    console.log(`${sr.canValidate ? "✓" : "✗"} ${site?.name}: ${sr.status}`);
    if (!sr.canValidate) console.log("  ", sr.blockingMessages.join(" · "));
  }
}

main().finally(() => prisma.$disconnect());
