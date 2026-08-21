import { PrismaClient } from "@prisma/client";
import { validateSitePlanningGate } from "../src/services/rules/validate-site-planning-gate";

const prisma = new PrismaClient();
async function main() {
  const gemaux = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const month = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 9 } });
  if (!gemaux || !month) return;
  const gate = await validateSitePlanningGate(month.id, gemaux.id);
  if (gate.canValidate) {
    console.log("✓ Les Gémeaux validé");
  } else {
    console.log("✗", gate.blockingMessages.join(" · "));
    const asg = await prisma.assignment.findMany({
      where: { siteId: gemaux.id, planningMonthId: month.id },
      include: { agent: true, alerts: true },
    });
    for (const a of asg) {
      for (const al of a.alerts.filter((x) => x.severity === "ERROR")) {
        console.log(
          a.date.toISOString().slice(0, 10),
          a.agent.lastName,
          al.ruleCode,
          al.message
        );
      }
    }
  }
}
main().finally(() => prisma.$disconnect());
