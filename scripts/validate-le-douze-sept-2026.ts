import { prisma } from "../src/lib/db";
import { validateSiteForExport } from "../src/services/rules/validate-planning-gate";
import { validatePlanningMonth } from "../src/services/rules/validate-assignment";

async function main() {
  const site = await prisma.site.findFirst({
    where: { name: { contains: "DOUZE", mode: "insensitive" } },
  });
  if (!site) {
    console.log("Site not found");
    return;
  }

  const pm = await prisma.planningMonth.findFirst({
    where: { year: 2026, month: 9 },
  });
  if (!pm) {
    console.log("Planning month not found");
    return;
  }

  console.log("Site:", site.name, site.id);
  console.log("PlanningMonth:", pm.id);

  const check = await validateSiteForExport(pm.id, site.id);
  console.log("Export ready:", check.ready);
  console.log("Errors:", check.errorCount, "Warnings:", check.warningCount);
  console.log("Unique messages:", check.errors.length);
  console.log("Sample messages:");
  for (const m of check.errors.slice(0, 20)) {
    console.log(" -", m);
  }

  const stats = await validatePlanningMonth(pm.id);
  console.log("Month stats:", stats);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
