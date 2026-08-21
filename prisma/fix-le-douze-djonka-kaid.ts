/**
 * LE DOUZE septembre 2026:
 * - 28/29/30 : DJONKA journée 08:45–23:30 (retire DJEDIA)
 * - KAID : pas 4 vac à la file → EVINA prend les vendredis 4 et 11 (avant les samedis KAID)
 *
 * Run: npx tsx prisma/fix-le-douze-djonka-kaid.ts
 */
import { PrismaClient } from "@prisma/client";
import { seedAgentSiteRules } from "./seed-agent-site-rules";
import {
  AGENT_CONSTRAINTS,
  constraintToAgentSeed,
} from "../src/data/agent-constraints";
import {
  LE_DOUZE_DJONKA_FULL_DAYS_SEP_2026,
  LE_DOUZE_REQUIREMENTS,
  leDouzeExcelTimes,
  toRequirementCreateData,
} from "./site-requirements-lajimi";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

const KAID_FRIDAYS_TO_EVINA = ["2026-09-04", "2026-09-11"];

async function main() {
  const leDouze = await prisma.site.findFirst({ where: { name: "LE DOUZE" } });
  if (!leDouze) throw new Error("LE DOUZE introuvable");

  const month = await prisma.planningMonth.findFirst({
    where: { year: 2026, month: 9 },
  });
  if (!month) throw new Error("Planning septembre 2026 introuvable");

  const agents = await prisma.agent.findMany();
  const agentMap = new Map<string, (typeof agents)[0]>();
  for (const agent of agents) {
    const key = agent.firstName.trim()
      ? `${agent.firstName.trim()}_${agent.lastName}`
      : agent.lastName;
    agentMap.set(key, agent);
    agentMap.set(agent.lastName, agent);
  }

  const djonka = agentMap.get("DJONKA");
  const djedia = agentMap.get("Dahmen_DJEDIA") ?? agentMap.get("DJEDIA");
  const kaid = agentMap.get("Yacine_KAID") ?? agentMap.get("KAID");
  const evina = agentMap.get("Pierre Marie_EVINA") ?? agentMap.get("EVINA");
  if (!djonka || !kaid || !evina) {
    throw new Error("Agent DJONKA / KAID / EVINA introuvable");
  }

  await prisma.siteRequirement.deleteMany({ where: { siteId: leDouze.id } });
  await prisma.siteRequirement.createMany({
    data: LE_DOUZE_REQUIREMENTS.map((req) => ({
      siteId: leDouze.id,
      ...toRequirementCreateData(req),
    })),
  });
  const reqs = await prisma.siteRequirement.findMany({
    where: { siteId: leDouze.id },
  });

  const assignments = await prisma.assignment.findMany({
    where: { siteId: leDouze.id, planningMonthId: month.id },
  });

  for (const assignment of assignments) {
    const dateKey = toDateKey(assignment.date);
    const times = leDouzeExcelTimes(
      dateKey,
      assignment.startTime,
      assignment.endTime,
      getDayOfWeek(assignment.date)
    );
    const req = reqs.find((r) => {
      if (r.startTime !== times.startTime || r.endTime !== times.endTime) return false;
      if (r.specificDate) return toDateKey(r.specificDate) === dateKey;
      return r.days.includes(getDayOfWeek(assignment.date));
    });
    if (!req) continue;
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        requirementId: req.id,
        startTime: times.startTime,
        endTime: times.endTime,
        hours: calculateShiftHours(times.startTime, times.endTime),
      },
    });
  }

  for (const full of LE_DOUZE_DJONKA_FULL_DAYS_SEP_2026) {
    const dayAssignments = await prisma.assignment.findMany({
      where: { siteId: leDouze.id, planningMonthId: month.id },
    });
    const onDay = dayAssignments.filter((a) => toDateKey(a.date) === full.date);
    const extras = onDay.filter((a) => a.agentId !== djonka.id);
    const djonkaOnDay = onDay.filter((a) => a.agentId === djonka.id);
    const toDelete = [
      ...extras.map((a) => a.id),
      ...djonkaOnDay.slice(1).map((a) => a.id),
    ];
    if (toDelete.length > 0) {
      await prisma.alert.deleteMany({ where: { assignmentId: { in: toDelete } } });
      await prisma.assignment.deleteMany({ where: { id: { in: toDelete } } });
    }

    const req = reqs.find(
      (r) =>
        r.specificDate &&
        toDateKey(r.specificDate) === full.date &&
        r.startTime === full.startTime &&
        r.endTime === full.endTime
    );
    if (!req) throw new Error(`Créneau journée ${full.date} introuvable`);

    const keep = djonkaOnDay[0];
    const hours = calculateShiftHours(full.startTime, full.endTime);
    const date = new Date(`${full.date}T12:00:00.000Z`);
    if (keep) {
      await prisma.assignment.update({
        where: { id: keep.id },
        data: {
          requirementId: req.id,
          startTime: full.startTime,
          endTime: full.endTime,
          hours,
          agentId: djonka.id,
        },
      });
    } else {
      await prisma.assignment.create({
        data: {
          planningMonthId: month.id,
          agentId: djonka.id,
          siteId: leDouze.id,
          requirementId: req.id,
          date,
          shiftType: "CUSTOM",
          role: "AGENT",
          startTime: full.startTime,
          endTime: full.endTime,
          hours,
        },
      });
    }
    const removed = extras.map((a) => a.agentId).join(",") || "aucun";
    console.log(`✓ ${full.date} DJONKA ${full.startTime}–${full.endTime} (retiré: ${removed})`);
  }

  for (const dateKey of KAID_FRIDAYS_TO_EVINA) {
    const dayAssignments = await prisma.assignment.findMany({
      where: { siteId: leDouze.id, planningMonthId: month.id },
    });
    const jour = dayAssignments.find(
      (a) =>
        toDateKey(a.date) === dateKey &&
        a.startTime === "08:45" &&
        a.endTime === "16:45" &&
        a.agentId === kaid.id
    );
    if (!jour) {
      console.warn(`! Pas de vacation KAID jour le ${dateKey}`);
      continue;
    }
    await prisma.assignment.update({
      where: { id: jour.id },
      data: { agentId: evina.id },
    });
    console.log(`✓ ${dateKey} jour 08:45–16:45 : KAID → EVINA (casse la série mer–sam)`);
  }

  const sites = await prisma.site.findMany();
  const siteByKey: Record<string, (typeof sites)[0]> = {};
  for (const site of sites) {
    if (site.name.includes("Gémeaux")) siteByKey.GEMEAUX = site;
    else if (site.name === "ORDINAL") siteByKey.ORDINAL = site;
    else if (site.name === "LE DOUZE") siteByKey["LE DOUZE"] = site;
    else if (site.name === "PLEYEL") siteByKey.PLEYEL = site;
    else if (site.name === "VISAGE DU MONDE") siteByKey.VISAGE = site;
  }

  await seedAgentSiteRules(prisma, agentMap, siteByKey);

  for (const spec of AGENT_CONSTRAINTS) {
    const seed = constraintToAgentSeed(spec);
    const agent = agentMap.get(spec.agentKey);
    if (!agent) continue;
    if (
      spec.agentKey !== "DJONKA" &&
      spec.agentKey !== "Dahmen_DJEDIA" &&
      spec.agentKey !== "Yacine_KAID" &&
      spec.agentKey !== "Pierre Marie_EVINA"
    ) {
      continue;
    }
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        notes: seed.notes,
        siteRestrictionType: seed.siteRestrictionType,
        allowedSiteIds:
          seed.authorizedSiteKeys.length > 0
            ? seed.authorizedSiteKeys
                .map((k) => siteByKey[k]?.id)
                .filter((id): id is string => Boolean(id))
            : [],
      },
    });
  }

  if (djedia) {
    console.log("✓ DJEDIA retiré du secours LE DOUZE");
  }
  console.log("\nLE DOUZE mis à jour.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
