/**
 * Apply Mr. Lajimi operational spec to an existing database.
 * Run: npx tsx prisma/migrate-lajimi-spec.ts
 */
import { DayOfWeek, PositionRole, PrismaClient } from "@prisma/client";
import { seedAgentSiteRules } from "./seed-agent-site-rules";
import {
  AGENT_CONSTRAINTS,
  constraintToAgentSeed,
} from "../src/data/agent-constraints";
import {
  GEMEAUX_REQUIREMENTS,
  LE_DOUZE_REQUIREMENTS,
  PLEYEL_REQUIREMENTS,
  VISAGE_SEPTEMBER_2026_SHIFTS,
  leDouzeExcelTimes,
  toRequirementCreateData,
} from "./site-requirements-lajimi";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

function excelTimesForLeDouze(
  date: Date,
  startTime: string,
  endTime: string
): { startTime: string; endTime: string } {
  return leDouzeExcelTimes(
    toDateKey(date),
    startTime,
    endTime,
    getDayOfWeek(date)
  );
}

function requirementApplies(
  req: {
    days: DayOfWeek[];
    startTime: string;
    endTime: string;
    specificDate: Date | null;
  },
  date: Date,
  startTime: string,
  endTime: string
): boolean {
  if (req.startTime !== startTime || req.endTime !== endTime) return false;
  if (req.specificDate) return toDateKey(req.specificDate) === toDateKey(date);
  return req.days.includes(getDayOfWeek(date));
}

async function main() {
  const gemeaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux", mode: "insensitive" } },
  });
  const leDouze = await prisma.site.findFirst({ where: { name: "LE DOUZE" } });
  const pleyel = await prisma.site.findFirst({ where: { name: "PLEYEL" } });

  if (gemeaux) {
    await prisma.siteRequirement.deleteMany({ where: { siteId: gemeaux.id } });
    await prisma.siteRequirement.createMany({
      data: GEMEAUX_REQUIREMENTS.map((req) => ({
        siteId: gemeaux.id,
        label: req.label,
        days: req.days,
        shiftType: req.shiftType,
        startTime: req.startTime,
        endTime: req.endTime,
        role: req.role ?? PositionRole.AGENT,
        agentCount: req.agentCount,
        priority: req.priority,
        active: true,
      })),
    });
    console.log(`✓ Exigences Les Gémeaux (${GEMEAUX_REQUIREMENTS.length} postes)`);
  }

  if (leDouze) {
    const existingAssignments = await prisma.assignment.findMany({
      where: { siteId: leDouze.id },
    });

    await prisma.siteRequirement.deleteMany({ where: { siteId: leDouze.id } });
    await prisma.siteRequirement.createMany({
      data: LE_DOUZE_REQUIREMENTS.map((req) => ({
        siteId: leDouze.id,
        ...toRequirementCreateData(req),
      })),
    });
    const newReqs = await prisma.siteRequirement.findMany({
      where: { siteId: leDouze.id },
    });

    let rematched = 0;
    for (const assignment of existingAssignments) {
      const inExcelMonth = toDateKey(assignment.date).startsWith("2026-09");
      const times = inExcelMonth
        ? excelTimesForLeDouze(
            assignment.date,
            assignment.startTime,
            assignment.endTime
          )
        : { startTime: assignment.startTime, endTime: assignment.endTime };
      const req = newReqs.find((r) =>
        requirementApplies(r, assignment.date, times.startTime, times.endTime)
      );
      if (!req) {
        if (inExcelMonth) {
          console.warn(
            `! LE DOUZE ${toDateKey(assignment.date)} ${assignment.startTime}–${assignment.endTime} : pas de créneau Excel`
          );
        }
        continue;
      }
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: {
          requirementId: req.id,
          startTime: times.startTime,
          endTime: times.endTime,
          hours: calculateShiftHours(times.startTime, times.endTime),
        },
      });
      rematched += 1;
    }
    console.log(
      `✓ Exigences LE DOUZE (${LE_DOUZE_REQUIREMENTS.length} postes), ${rematched} affectations alignées sur l'Excel`
    );
  }

  if (pleyel) {
    const existingAssignments = await prisma.assignment.findMany({
      where: { siteId: pleyel.id },
    });
    await prisma.siteRequirement.deleteMany({ where: { siteId: pleyel.id } });
    await prisma.siteRequirement.createMany({
      data: PLEYEL_REQUIREMENTS.map((req) => ({
        siteId: pleyel.id,
        ...toRequirementCreateData(req),
      })),
    });
    const newReqs = await prisma.siteRequirement.findMany({
      where: { siteId: pleyel.id },
    });
    let rematched = 0;
    for (const assignment of existingAssignments) {
      const req = newReqs.find((r) =>
        requirementApplies(
          r,
          assignment.date,
          assignment.startTime,
          assignment.endTime
        )
      );
      if (!req) continue;
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: { requirementId: req.id },
      });
      rematched += 1;
    }
    console.log(
      `✓ Exigences PLEYEL (${PLEYEL_REQUIREMENTS.length} postes), ${rematched} affectations recollées`
    );
  }

  const visage = await prisma.site.findFirst({
    where: { name: "VISAGE DU MONDE" },
  });
  if (visage) {
    await prisma.siteRequirement.deleteMany({ where: { siteId: visage.id } });
    await prisma.siteRequirement.createMany({
      data: VISAGE_SEPTEMBER_2026_SHIFTS.map((shift) => ({
        siteId: visage.id,
        label: `SSIAP ${shift.date.slice(8, 10)}/${shift.date.slice(5, 7)} ${shift.start}–${shift.end}`,
        days: [],
        shiftType: "CUSTOM",
        startTime: shift.start,
        endTime: shift.end,
        role: PositionRole.AGENT,
        agentCount: 1,
        priority: 0,
        active: true,
        specificDate: new Date(`${shift.date}T12:00:00.000Z`),
      })),
    });
    await prisma.site.update({
      where: { id: visage.id },
      data: {
        notes:
          "Septembre 2026 — FILES AOUT/Sept 2026.xlsx (SSIAP bâtiment, 1 agent). Pas de vacation les autres jours.",
      },
    });
    console.log(`✓ Exigences VISAGE DU MONDE (${VISAGE_SEPTEMBER_2026_SHIFTS.length} dates)`);
  }

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

  const agentMap = new Map<string, (typeof agents)[0]>();
  for (const agent of agents) {
    const key = agent.firstName.trim()
      ? `${agent.firstName.trim()}_${agent.lastName}`
      : agent.lastName;
    agentMap.set(key, agent);
    agentMap.set(agent.lastName, agent);
  }

  await seedAgentSiteRules(prisma, agentMap, siteByKey);

  for (const spec of AGENT_CONSTRAINTS) {
    const seed = constraintToAgentSeed(spec);
    const agent = agentMap.get(spec.agentKey);
    if (!agent) continue;

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        contractHours: seed.contractHours,
        overtimeAllowed: seed.overtimeAllowed,
        canWorkNight: seed.canWorkNight,
        maxVacationsPerMonth: seed.maxVacationsPerMonth,
        preferredDays: seed.preferredDays,
        dayOnly: seed.dayOnly,
        nightForbidden: seed.nightForbidden,
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
  console.log(`✓ Profils agents synchronisés (${AGENT_CONSTRAINTS.length})`);

  const dorce = agentMap.get("Marcelus_DORCE") ?? agentMap.get("DORCE");
  const evina = agentMap.get("Pierre Marie_EVINA") ?? agentMap.get("EVINA");

  if (dorce) {
    await prisma.vacation.deleteMany({
      where: { agentId: dorce.id, startDate: { gte: new Date("2026-09-01") } },
    });
    await prisma.vacation.create({
      data: {
        agentId: dorce.id,
        startDate: new Date("2026-09-01T12:00:00.000Z"),
        endDate: new Date("2026-09-30T12:00:00.000Z"),
        reason: "Congé — indisponible tout le mois de septembre",
      },
    });
    console.log("✓ Congé DORCE — septembre 2026 entier");
  }

  if (evina) {
    await prisma.vacation.deleteMany({
      where: {
        agentId: evina.id,
        startDate: { gte: new Date("2026-09-01") },
      },
    });
    await prisma.vacation.create({
      data: {
        agentId: evina.id,
        startDate: new Date("2026-09-14T12:00:00.000Z"),
        endDate: new Date("2026-10-01T12:00:00.000Z"),
        reason: "Congé planifié",
      },
    });
    console.log("✓ Congé EVINA — 14/09 au 01/10");
  }

  const maxShiftsRule = await prisma.rule.findFirst({
    where: { code: "MAX_SHIFTS_ON_DAY" },
  });
  if (!maxShiftsRule) {
    await prisma.rule.create({
      data: {
        code: "MAX_SHIFTS_ON_DAY",
        name: "Maximum vacations par jour",
        description: "Nombre max de vacations un jour donné dans le mois (ex. Kaid — 2 samedis)",
        severity: "ERROR",
        category: "scheduling",
        enabled: true,
      },
    });
    console.log("✓ Règle MAX_SHIFTS_ON_DAY activée");
  }

  console.log("\nMigration Lajimi spec terminée.");
  console.log(
    "→ LE DOUZE : horaires Excel déjà appliqués aux affectations existantes (pas besoin de vider)."
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
