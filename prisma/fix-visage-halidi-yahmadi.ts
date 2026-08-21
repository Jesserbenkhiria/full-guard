/**
 * VISAGE DU MONDE — septembre 2026 (Lajimi / Halidi dispos):
 * - HALIDI : dimanches au VISAGE (20 et 27). Voyage indispo 10–13/09.
 * - YAHMADI : semaine au VISAGE + dim 13 (Halidi absent). Gémeaux soir/nuit seulement.
 *
 * Run: npx tsx prisma/fix-visage-halidi-yahmadi.ts
 */
import { PrismaClient, ShiftType } from "@prisma/client";
import { seedAgentSiteRules } from "./seed-agent-site-rules";
import {
  AGENT_CONSTRAINTS,
  constraintToAgentSeed,
} from "../src/data/agent-constraints";
import { VISAGE_SEPTEMBER_2026_SHIFTS } from "./site-requirements-lajimi";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

type Slot = {
  date: string;
  startTime: string;
  endTime: string;
  agentLastName: string;
};

/** Dimanches → HALIDI si dispo ; sinon YAHMADI. Semaine → YAHMADI. */
const SCHEDULE: Slot[] = VISAGE_SEPTEMBER_2026_SHIFTS.map((shift) => {
  const day = new Date(`${shift.date}T12:00:00.000Z`).getUTCDay();
  const isSunday = day === 0;
  const halidiUnavailable =
    shift.date >= "2026-09-10" && shift.date <= "2026-09-13";
  const agentLastName =
    isSunday && !halidiUnavailable ? "HALIDI" : "YAHMADI";
  return {
    date: shift.date,
    startTime: shift.start,
    endTime: shift.end,
    agentLastName,
  };
});

async function main() {
  const visage = await prisma.site.findFirst({
    where: { name: "VISAGE DU MONDE" },
    include: { requirements: { where: { active: true } } },
  });
  if (!visage) throw new Error("VISAGE DU MONDE introuvable");

  const month = await prisma.planningMonth.findFirst({
    where: { year: 2026, month: 9 },
  });
  if (!month) throw new Error("Planning septembre 2026 introuvable");

  let halidi = await prisma.agent.findFirst({
    where: { lastName: "HALIDI" },
  });
  if (!halidi) {
    halidi = await prisma.agent.create({
      data: {
        firstName: "Athoumani",
        lastName: "HALIDI",
        contractHours: null,
        overtimeAllowed: true,
        canWorkNight: true,
        dayOnly: false,
        nightForbidden: false,
        siteRestrictionType: "ONLY",
        allowedSiteIds: [visage.id],
        preferredDays: ["SUNDAY"],
        active: true,
        notes:
          "✅ VISAGE DU MONDE — dimanches. Indisponible 10–13/09/2026 (voyage)",
      },
    });
    console.log("✓ Agent HALIDI Athoumani créé");
  }

  const sites = await prisma.site.findMany();
  const siteByKey: Record<string, (typeof sites)[0]> = {};
  for (const site of sites) {
    if (site.name.includes("Gémeaux")) siteByKey.GEMEAUX = site;
    else if (site.name === "VISAGE DU MONDE") siteByKey.VISAGE = site;
    else if (site.name === "ORDINAL") siteByKey.ORDINAL = site;
    else if (site.name === "LE DOUZE") siteByKey["LE DOUZE"] = site;
    else if (site.name === "PLEYEL") siteByKey.PLEYEL = site;
  }

  const agents = await prisma.agent.findMany();
  const agentMap = new Map<string, (typeof agents)[0]>();
  for (const agent of agents) {
    const key = agent.firstName.trim()
      ? `${agent.firstName.trim()}_${agent.lastName}`
      : agent.lastName;
    agentMap.set(key, agent);
    agentMap.set(agent.lastName, agent);
  }
  agentMap.set("HALIDI", halidi);

  await seedAgentSiteRules(prisma, agentMap, siteByKey);

  for (const spec of AGENT_CONSTRAINTS) {
    if (!["YAHMADI", "Athoumani_HALIDI"].includes(spec.agentKey)) continue;
    const seed = constraintToAgentSeed(spec);
    const agent = agentMap.get(spec.agentKey) ?? agentMap.get(spec.lastName);
    if (!agent) continue;
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        contractHours: seed.contractHours,
        overtimeAllowed: seed.overtimeAllowed,
        preferredDays: seed.preferredDays,
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
  console.log("✓ Profils YAHMADI / HALIDI synchronisés");

  await prisma.vacation.deleteMany({
    where: {
      agentId: halidi.id,
      startDate: { gte: new Date("2026-09-01T12:00:00.000Z") },
      endDate: { lte: new Date("2026-09-30T12:00:00.000Z") },
    },
  });
  await prisma.vacation.create({
    data: {
      agentId: halidi.id,
      startDate: new Date("2026-09-10T12:00:00.000Z"),
      endDate: new Date("2026-09-13T12:00:00.000Z"),
      reason: "Voyage — indisponible du 10 au 13/09/2026",
    },
  });
  console.log("✓ Congé HALIDI 10–13/09 (voyage)");

  const existing = await prisma.assignment.findMany({
    where: { siteId: visage.id, planningMonthId: month.id },
  });
  if (existing.length > 0) {
    const ids = existing.map((a) => a.id);
    await prisma.alert.deleteMany({ where: { assignmentId: { in: ids } } });
    await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
  }

  for (const slot of SCHEDULE) {
    const date = new Date(`${slot.date}T12:00:00.000Z`);
    const agent = agentMap.get(slot.agentLastName);
    if (!agent) throw new Error(`Agent ${slot.agentLastName} introuvable`);

    const req = visage.requirements.find((r) => {
      if (r.startTime !== slot.startTime || r.endTime !== slot.endTime) {
        return false;
      }
      if (!r.specificDate) return false;
      return toDateKey(r.specificDate) === slot.date;
    });

    await prisma.assignment.create({
      data: {
        planningMonthId: month.id,
        agentId: agent.id,
        siteId: visage.id,
        requirementId: req?.id ?? null,
        date,
        shiftType: ShiftType.CUSTOM,
        role: "AGENT",
        startTime: slot.startTime,
        endTime: slot.endTime,
        hours: calculateShiftHours(slot.startTime, slot.endTime),
      },
    });
  }

  console.log(`✓ VISAGE septembre : ${SCHEDULE.length} affectations`);

  const byAgent = new Map<string, { n: number; h: number }>();
  for (const slot of SCHEDULE) {
    const cur = byAgent.get(slot.agentLastName) ?? { n: 0, h: 0 };
    cur.n += 1;
    cur.h += calculateShiftHours(slot.startTime, slot.endTime);
    byAgent.set(slot.agentLastName, cur);
  }
  for (const [name, v] of byAgent) {
    console.log(
      `${name.padEnd(10)} ${v.n} vac  ${Math.round(v.h * 10) / 10}h`
    );
  }

  const { validateSitePlanningGate } = await import(
    "../src/services/rules/validate-site-planning-gate"
  );
  const gate = await validateSitePlanningGate(month.id, visage.id);
  if (gate.canValidate) {
    console.log("✓ VISAGE validé");
  } else {
    console.log(`✗ VISAGE non validé: ${gate.blockingMessages.join(" · ")}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
