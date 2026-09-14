/**
 * Met à jour agentCount du poste AGENT DAY lun-ven de 2 → 3
 * pour refléter l'effectif réel (DJEDIA + 2 autres minimum).
 */
import { PrismaClient, PositionRole, ShiftType } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const gem = await p.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!gem) { console.error("Gémeaux introuvable"); return; }

  const reqs = await p.siteRequirement.findMany({ where: { siteId: gem.id } });
  const weekdayAgentReq = reqs.find(
    (r) =>
      r.specificDate === null &&
      r.role === PositionRole.AGENT &&
      r.shiftType === ShiftType.DAY &&
      r.startTime === "07:00" &&
      r.endTime === "19:00" &&
      r.days.length >= 4 // weekdays (Mon-Fri = 5 days)
  );

  if (!weekdayAgentReq) {
    console.log("Poste semaine introuvable");
    console.log("Postes disponibles:");
    for (const r of reqs) console.log(`  ${r.role} ${r.shiftType} ${r.startTime}-${r.endTime} days=${r.days.join(",")} agentCount=${r.agentCount}`);
    return;
  }

  if (weekdayAgentReq.agentCount === 3) {
    console.log(`✓ Déjà agentCount=3 (${weekdayAgentReq.id})`);
    return;
  }

  await p.siteRequirement.update({
    where: { id: weekdayAgentReq.id },
    data: { agentCount: 3 },
  });
  console.log(`✓ Mis à jour: poste AGENT DAY ${weekdayAgentReq.startTime}-${weekdayAgentReq.endTime} lun-ven → agentCount=3 (était ${weekdayAgentReq.agentCount})`);
}

main().catch(console.error).finally(() => p.$disconnect());
