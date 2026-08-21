/**
 * PLEYEL septembre 2026:
 * - DALIGOU / ZAMBA / OUMBA : ~12 vacations, contrat 156h, **max 2 week-ends**
 * - BELLATTRACH : reliquat, aussi max 2 week-ends
 *
 * Week-ends sept 2026 : 5-6, 12-13, 19-20, 26-27 (4).
 * 2 agents × 2 shifts / week-end, chacun exactement 2 week-ends.
 * 2/09 et 3/09 : OUMBA (nuits). ZAMBA repos le 2 (visite médicale).
 * 26–27 : ZAMBA jours + OUMBA nuits. BELLATTRACH retiré le 2, 3 et 26–27 (reste le 19–20).
 *
 * Run: npx tsx prisma/fix-pleyel-12-vac.ts
 */
import { PrismaClient } from "@prisma/client";
import { seedAgentSiteRules } from "./seed-agent-site-rules";
import {
  AGENT_CONSTRAINTS,
  constraintToAgentSeed,
} from "../src/data/agent-constraints";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey } from "../src/lib/planning/dates";
import { isWeekendDay, weekendPeriodKey } from "../src/lib/planning/weekends";

const prisma = new PrismaClient();

type Slot = {
  date: string;
  startTime: string;
  endTime: string;
  shiftType: "DAY" | "NIGHT";
  agentLastName: string;
};

const SCHEDULE: Slot[] = [
  // Semaine — pas 2 nuits consécutives, repos ≥ 11h
  { date: "2026-09-01", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "DALIGOU" },
  { date: "2026-09-02", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "OUMBA" },
  { date: "2026-09-03", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "OUMBA" },
  { date: "2026-09-04", startTime: "18:30", endTime: "08:00", shiftType: "NIGHT", agentLastName: "ZAMBA" },
  // WE1 5-6 : DALIGOU jours + ZAMBA nuits
  { date: "2026-09-05", startTime: "08:00", endTime: "20:00", shiftType: "DAY", agentLastName: "DALIGOU" },
  { date: "2026-09-05", startTime: "20:00", endTime: "08:00", shiftType: "NIGHT", agentLastName: "ZAMBA" },
  { date: "2026-09-06", startTime: "08:00", endTime: "20:00", shiftType: "DAY", agentLastName: "DALIGOU" },
  { date: "2026-09-06", startTime: "20:00", endTime: "08:30", shiftType: "NIGHT", agentLastName: "ZAMBA" },
  { date: "2026-09-07", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "DALIGOU" },
  { date: "2026-09-08", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "OUMBA" },
  { date: "2026-09-09", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "DALIGOU" },
  { date: "2026-09-10", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "ZAMBA" },
  { date: "2026-09-11", startTime: "18:30", endTime: "08:00", shiftType: "NIGHT", agentLastName: "DALIGOU" },
  // WE2 12-13 : OUMBA jours + DALIGOU nuits
  { date: "2026-09-12", startTime: "08:00", endTime: "20:00", shiftType: "DAY", agentLastName: "OUMBA" },
  { date: "2026-09-12", startTime: "20:00", endTime: "08:00", shiftType: "NIGHT", agentLastName: "DALIGOU" },
  { date: "2026-09-13", startTime: "08:00", endTime: "20:00", shiftType: "DAY", agentLastName: "OUMBA" },
  { date: "2026-09-13", startTime: "20:00", endTime: "08:30", shiftType: "NIGHT", agentLastName: "DALIGOU" },
  { date: "2026-09-14", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "OUMBA" },
  { date: "2026-09-15", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "ZAMBA" },
  { date: "2026-09-16", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "DALIGOU" },
  { date: "2026-09-17", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "OUMBA" },
  { date: "2026-09-18", startTime: "18:30", endTime: "08:00", shiftType: "NIGHT", agentLastName: "DALIGOU" },
  // WE3 19-20 : ZAMBA jours + BELLATTRACH nuits
  { date: "2026-09-19", startTime: "08:00", endTime: "20:00", shiftType: "DAY", agentLastName: "ZAMBA" },
  { date: "2026-09-19", startTime: "20:00", endTime: "08:00", shiftType: "NIGHT", agentLastName: "BELLATTRACH" },
  { date: "2026-09-20", startTime: "08:00", endTime: "20:00", shiftType: "DAY", agentLastName: "ZAMBA" },
  { date: "2026-09-20", startTime: "20:00", endTime: "08:30", shiftType: "NIGHT", agentLastName: "BELLATTRACH" },
  { date: "2026-09-21", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "ZAMBA" },
  { date: "2026-09-22", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "OUMBA" },
  { date: "2026-09-23", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "DALIGOU" },
  { date: "2026-09-24", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "OUMBA" },
  { date: "2026-09-25", startTime: "18:30", endTime: "08:00", shiftType: "NIGHT", agentLastName: "DALIGOU" },
  // WE4 26-27 : ZAMBA jours + OUMBA nuits (BELLATTRACH retiré)
  { date: "2026-09-26", startTime: "08:00", endTime: "20:00", shiftType: "DAY", agentLastName: "ZAMBA" },
  { date: "2026-09-26", startTime: "20:00", endTime: "08:00", shiftType: "NIGHT", agentLastName: "OUMBA" },
  { date: "2026-09-27", startTime: "08:00", endTime: "20:00", shiftType: "DAY", agentLastName: "ZAMBA" },
  { date: "2026-09-27", startTime: "20:00", endTime: "08:30", shiftType: "NIGHT", agentLastName: "OUMBA" },
  { date: "2026-09-28", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "ZAMBA" },
  { date: "2026-09-29", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "OUMBA" },
  { date: "2026-09-30", startTime: "18:30", endTime: "08:30", shiftType: "NIGHT", agentLastName: "ZAMBA" },
];

async function main() {
  await prisma.rule.updateMany({
    where: { code: "MAX_WEEKENDS" },
    data: {
      severity: "ERROR",
      description:
        "Maximum de 2 week-ends travaillés par mois — 3e ou 4e week-end interdit",
    },
  });

  const pleyel = await prisma.site.findFirst({
    where: { name: "PLEYEL" },
    include: { requirements: { where: { active: true } } },
  });
  if (!pleyel) throw new Error("PLEYEL introuvable");

  const month = await prisma.planningMonth.findFirst({
    where: { year: 2026, month: 9 },
  });
  if (!month) throw new Error("Planning septembre 2026 introuvable");

  let bellattrach = await prisma.agent.findFirst({
    where: { lastName: "BELLATTRACH" },
  });
  if (!bellattrach) {
    bellattrach = await prisma.agent.create({
      data: {
        firstName: "",
        lastName: "BELLATTRACH",
        contractHours: null,
        overtimeAllowed: true,
        canWorkNight: true,
        dayOnly: false,
        nightForbidden: false,
        siteRestrictionType: "PREFERRED",
        allowedSiteIds: [pleyel.id],
        active: true,
        notes:
          "✅ PLEYEL — reprend les vacations au-delà des 12 de DALIGOU / ZAMBA / OUMBA",
      },
    });
    console.log("✓ Agent BELLATTRACH créé");
  } else if (bellattrach.firstName === "BELLATTRACH") {
    bellattrach = await prisma.agent.update({
      where: { id: bellattrach.id },
      data: { firstName: "" },
    });
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
  agentMap.set("BELLATTRACH", bellattrach);

  const zamba = agentMap.get("Georges_ZAMBA") ?? agentMap.get("ZAMBA");
  if (zamba) {
    const visitDate = new Date("2026-09-02T12:00:00.000Z");
    const visits = await prisma.medicalVisit.findMany({
      where: { agentId: zamba.id },
    });
    const hasSep2 = visits.some((v) => {
      const key = v.date.toISOString().slice(0, 10);
      return key === "2026-09-02" || key === "2026-09-01";
    });
    if (!hasSep2) {
      await prisma.medicalVisit.create({
        data: {
          agentId: zamba.id,
          date: visitDate,
          time: "14:45",
          notes: "Visite médicale — repos toute la journée",
        },
      });
      console.log("✓ Visite médicale ZAMBA 02/09 14:45 enregistrée");
    }
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
    if (
      ![
        "Gnagno_DALIGOU",
        "Georges_ZAMBA",
        "Cyrille_OUMBA",
        "BELLATTRACH",
      ].includes(spec.agentKey)
    ) {
      continue;
    }
    const seed = constraintToAgentSeed(spec);
    const agent = agentMap.get(spec.agentKey) ?? agentMap.get(spec.lastName);
    if (!agent) continue;
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        contractHours: seed.contractHours,
        overtimeAllowed: seed.overtimeAllowed,
        notes: seed.notes,
        siteRestrictionType: seed.siteRestrictionType,
        allowedSiteIds:
          seed.authorizedSiteKeys.length > 0
            ? seed.authorizedSiteKeys
                .map((k) => siteByKey[k]?.id)
                .filter((id): id is string => Boolean(id))
            : agent.lastName === "BELLATTRACH"
              ? [pleyel.id]
              : [],
      },
    });
  }

  await prisma.site.update({
    where: { id: pleyel.id },
    data: {
      notes: "DALIGOU, ZAMBA, OUMBA, BELLATTRACH — max 2 week-ends / mois.",
    },
  });

  const existingSept = await prisma.assignment.findMany({
    where: { siteId: pleyel.id, planningMonthId: month.id },
  });
  if (existingSept.length > 0) {
    const ids = existingSept.map((a) => a.id);
    await prisma.alert.deleteMany({ where: { assignmentId: { in: ids } } });
    await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
  }

  for (const slot of SCHEDULE) {
    const date = new Date(`${slot.date}T12:00:00.000Z`);
    const agent = agentMap.get(slot.agentLastName);
    if (!agent) throw new Error(`Agent ${slot.agentLastName} introuvable`);

    const req = pleyel.requirements.find(
      (r) =>
        r.startTime === slot.startTime &&
        r.endTime === slot.endTime &&
        r.days.includes(getDayOfWeek(date))
    );

    await prisma.assignment.create({
      data: {
        planningMonthId: month.id,
        agentId: agent.id,
        siteId: pleyel.id,
        requirementId: req?.id ?? null,
        date,
        shiftType: slot.shiftType,
        role: "AGENT",
        startTime: slot.startTime,
        endTime: slot.endTime,
        hours: calculateShiftHours(slot.startTime, slot.endTime),
      },
    });
  }

  console.log(`✓ PLEYEL septembre : ${SCHEDULE.length} affectations`);

  const byAgent = new Map<
    string,
    { n: number; h: number; weekends: Set<string> }
  >();
  for (const slot of SCHEDULE) {
    const cur = byAgent.get(slot.agentLastName) ?? {
      n: 0,
      h: 0,
      weekends: new Set<string>(),
    };
    cur.n += 1;
    cur.h += calculateShiftHours(slot.startTime, slot.endTime);
    const d = parseDateKey(slot.date);
    if (isWeekendDay(d)) {
      cur.weekends.add(weekendPeriodKey(d));
    }
    byAgent.set(slot.agentLastName, cur);
  }
  for (const [name, v] of byAgent) {
    const we = v.weekends.size;
    const flag = we > 2 ? " ⚠ >2 WE" : "";
    console.log(
      `${name.padEnd(14)} ${v.n} vac  ${Math.round(v.h * 10) / 10}h  ${we} WE${flag}`
    );
  }

  const filled = new Set(
    SCHEDULE.map((s) => `${s.date}|${s.startTime}|${s.endTime}`)
  );
  console.log(`créneaux distincts: ${filled.size}`);

  const { validateSitePlanningGate } = await import(
    "../src/services/rules/validate-site-planning-gate"
  );
  const gate = await validateSitePlanningGate(month.id, pleyel.id);
  if (gate.canValidate) {
    console.log("✓ PLEYEL validé");
  } else {
    console.log(`✗ PLEYEL non validé: ${gate.blockingMessages.join(" · ")}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
