/**
 * Sync Camara ORDINAL rules (client confirmed Aug 2026):
 * - Lamine CAMARA: lun-ven 10h-17h
 * - Oumar CAMARA: sam-dim 08h-20h only (no Gémeaux)
 */
import { PrismaClient, ShiftType } from "@prisma/client";
import { seedAgentSiteRules } from "./seed-agent-site-rules";
import { AGENT_CONSTRAINTS, constraintToAgentSeed } from "../src/data/agent-constraints";

const prisma = new PrismaClient();

function d(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

async function main() {
  const sites = await prisma.site.findMany();
  const agents = await prisma.agent.findMany();

  const siteByKey: Record<string, (typeof sites)[0]> = {};
  for (const site of sites) {
    if (site.name.includes("Gémeaux")) siteByKey.GEMEAUX = site;
    else if (site.name === "ORDINAL") siteByKey.ORDINAL = site;
    else if (site.name === "LE DOUZE") siteByKey["LE DOUZE"] = site;
    else if (site.name === "PLEYEL") siteByKey.PLEYEL = site;
    else if (site.name === "VISAGE DU MONDE") siteByKey.VISAGE = site;
  }

  const ordinal = siteByKey.ORDINAL;
  if (!ordinal) {
    console.log("Site ORDINAL introuvable — rien à faire.");
    return;
  }

  const agentMap = new Map<string, (typeof agents)[0]>();
  for (const agent of agents) {
    const key = agent.firstName.trim()
      ? `${agent.firstName.trim()}_${agent.lastName}`
      : agent.lastName;
    agentMap.set(key, agent);
    agentMap.set(agent.lastName, agent);
  }

  await seedAgentSiteRules(prisma, agentMap, siteByKey);

  for (const spec of AGENT_CONSTRAINTS.filter(
    (c) => c.agentKey === "Oumar_CAMARA" || c.agentKey === "Lamine_CAMARA"
  )) {
    const seed = constraintToAgentSeed(spec);
    const agent = agentMap.get(spec.agentKey);
    if (!agent) continue;

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        preferredDays: seed.preferredDays,
        notes: seed.notes,
        siteRestrictionType: seed.siteRestrictionType,
        allowedSiteIds: seed.authorizedSiteKeys
          .map((k) => siteByKey[k]?.id)
          .filter((id): id is string => Boolean(id)),
      },
    });
    console.log(`✓ Profil synchronisé: ${spec.firstName} ${spec.lastName}`);
  }

  const lamine = agentMap.get("Lamine_CAMARA");
  const oumar = agentMap.get("Oumar_CAMARA");
  if (!lamine || !oumar) {
    console.log("Agents Camara introuvables — règles mises à jour, affectations non modifiées.");
    return;
  }

  // Remove off-site assignments (Oumar must not work Gémeaux, etc.)
  for (const agent of [lamine, oumar]) {
    const stray = await prisma.assignment.findMany({
      where: { agentId: agent.id, siteId: { not: ordinal.id } },
      select: { id: true, date: true, site: { select: { name: true } } },
    });
    for (const row of stray) {
      await prisma.alert.deleteMany({ where: { assignmentId: row.id } });
      await prisma.assignment.delete({ where: { id: row.id } });
      console.log(
        `✗ ${agent.firstName} ${agent.lastName} — retrait ${row.site.name} (${row.date.toISOString().slice(0, 10)})`
      );
    }
  }

  const planningMonths = await prisma.planningMonth.findMany({
    select: { id: true, year: true, month: true },
  });

  for (const pm of planningMonths) {
    const daysInMonth = new Date(Date.UTC(pm.year, pm.month, 0)).getUTCDate();
    const weekdays: string[] = [];
    const weekends: string[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${pm.year}-${String(pm.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dow = d(dateStr).getUTCDay();
      if (dow >= 1 && dow <= 5) weekdays.push(dateStr);
      else if (dow === 0 || dow === 6) weekends.push(dateStr);
    }

    const existing = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, siteId: ordinal.id },
    });

    for (const assignment of existing) {
      const key = d(assignment.date.toISOString().slice(0, 10)).getUTCDay();
      const isWeekend = key === 0 || key === 6;
      const wrongAgent =
        (isWeekend && assignment.agentId === lamine.id) ||
        (!isWeekend && assignment.agentId === oumar.id);

      if (wrongAgent) {
        await prisma.assignment.delete({ where: { id: assignment.id } });
        console.log(`✗ Affectation incorrecte supprimée (${assignment.date.toISOString().slice(0, 10)})`);
      }
    }

    const afterDelete = await prisma.assignment.findMany({
      where: { planningMonthId: pm.id, siteId: ordinal.id },
      select: { date: true, agentId: true },
    });
    const covered = new Set(afterDelete.map((a) => a.date.toISOString().slice(0, 10)));

    for (const dateStr of weekdays) {
      if (covered.has(dateStr)) continue;
      await prisma.assignment.create({
        data: {
          planningMonthId: pm.id,
          agentId: lamine.id,
          siteId: ordinal.id,
          date: d(dateStr),
          shiftType: ShiftType.CUSTOM,
          startTime: "10:00",
          endTime: "17:00",
          hours: 7,
          notes: "Lamine CAMARA — ORDINAL lun-ven",
        },
      });
      console.log(`+ Lamine ${dateStr}`);
    }

    for (const dateStr of weekends) {
      if (covered.has(dateStr)) continue;
      await prisma.assignment.create({
        data: {
          planningMonthId: pm.id,
          agentId: oumar.id,
          siteId: ordinal.id,
          date: d(dateStr),
          shiftType: ShiftType.CUSTOM,
          startTime: "08:00",
          endTime: "20:00",
          hours: 12,
          notes: "Oumar CAMARA — ORDINAL sam-dim",
        },
      });
      console.log(`+ Oumar ${dateStr}`);
    }
  }

  console.log("Migration Camara ORDINAL terminée.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
