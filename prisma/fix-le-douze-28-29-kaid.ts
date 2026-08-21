/**
 * LE DOUZE 28–29 sept : KAID jour 08:45–16:45, DJONKA après-midi.
 * 30 sept : DJONKA journée 08:45–23:30 (inchangé).
 *
 * Run: npx tsx prisma/fix-le-douze-28-29-kaid.ts
 */
import { PrismaClient } from "@prisma/client";
import { seedAgentSiteRules } from "./seed-agent-site-rules";
import {
  AGENT_CONSTRAINTS,
  constraintToAgentSeed,
} from "../src/data/agent-constraints";
import {
  LE_DOUZE_REQUIREMENTS,
  leDouzeExcelTimes,
  toRequirementCreateData,
} from "./site-requirements-lajimi";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

const SPLIT_DAYS: { date: string; soirEnd: string }[] = [
  { date: "2026-09-28", soirEnd: "23:00" },
  { date: "2026-09-29", soirEnd: "23:30" },
];

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
  const kaid = agentMap.get("Yacine_KAID") ?? agentMap.get("KAID");
  if (!djonka || !kaid) throw new Error("DJONKA / KAID introuvable");

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

  function findReq(date: Date, startTime: string, endTime: string) {
    const dateKey = toDateKey(date);
    return reqs.find((r) => {
      if (r.startTime !== startTime || r.endTime !== endTime) return false;
      if (r.specificDate) return toDateKey(r.specificDate) === dateKey;
      return r.days.includes(getDayOfWeek(date));
    });
  }

  const assignments = await prisma.assignment.findMany({
    where: { siteId: leDouze.id, planningMonthId: month.id },
  });

  for (const assignment of assignments) {
    const times = leDouzeExcelTimes(
      toDateKey(assignment.date),
      assignment.startTime,
      assignment.endTime,
      getDayOfWeek(assignment.date)
    );
    const req = findReq(assignment.date, times.startTime, times.endTime);
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

  for (const split of SPLIT_DAYS) {
    const date = new Date(`${split.date}T12:00:00.000Z`);
    const dayAsg = (
      await prisma.assignment.findMany({
        where: { siteId: leDouze.id, planningMonthId: month.id },
      })
    ).filter((a) => toDateKey(a.date) === split.date);

    const jourReq = findReq(date, "08:45", "16:45");
    const soirReq = findReq(date, "16:45", split.soirEnd);
    if (!jourReq || !soirReq) {
      throw new Error(`Créneaux jour/soir manquants le ${split.date}`);
    }

    const extras = dayAsg.filter(
      (a) =>
        !(
          (a.startTime === "08:45" && a.endTime === "16:45") ||
          (a.startTime === "16:45" && a.endTime === split.soirEnd)
        )
    );
    if (extras.length > 0) {
      const ids = extras.map((a) => a.id);
      await prisma.alert.deleteMany({ where: { assignmentId: { in: ids } } });
      await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
    }

    const remaining = (
      await prisma.assignment.findMany({
        where: { siteId: leDouze.id, planningMonthId: month.id },
      })
    ).filter((a) => toDateKey(a.date) === split.date);

    const jour = remaining.find(
      (a) => a.startTime === "08:45" && a.endTime === "16:45"
    );
    const soir = remaining.find(
      (a) => a.startTime === "16:45" && a.endTime === split.soirEnd
    );

    if (jour) {
      await prisma.assignment.update({
        where: { id: jour.id },
        data: {
          agentId: kaid.id,
          requirementId: jourReq.id,
          startTime: "08:45",
          endTime: "16:45",
          hours: calculateShiftHours("08:45", "16:45"),
        },
      });
    } else {
      await prisma.assignment.create({
        data: {
          planningMonthId: month.id,
          agentId: kaid.id,
          siteId: leDouze.id,
          requirementId: jourReq.id,
          date,
          shiftType: "CUSTOM",
          role: "AGENT",
          startTime: "08:45",
          endTime: "16:45",
          hours: calculateShiftHours("08:45", "16:45"),
        },
      });
    }

    if (soir) {
      await prisma.assignment.update({
        where: { id: soir.id },
        data: {
          agentId: djonka.id,
          requirementId: soirReq.id,
          startTime: "16:45",
          endTime: split.soirEnd,
          hours: calculateShiftHours("16:45", split.soirEnd),
        },
      });
    } else {
      await prisma.assignment.create({
        data: {
          planningMonthId: month.id,
          agentId: djonka.id,
          siteId: leDouze.id,
          requirementId: soirReq.id,
          date,
          shiftType: "CUSTOM",
          role: "AGENT",
          startTime: "16:45",
          endTime: split.soirEnd,
          hours: calculateShiftHours("16:45", split.soirEnd),
        },
      });
    }

    console.log(
      `✓ ${split.date} KAID 08:45–16:45 + DJONKA 16:45–${split.soirEnd}`
    );
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
    if (spec.agentKey !== "DJONKA" && spec.agentKey !== "Yacine_KAID") continue;
    const seed = constraintToAgentSeed(spec);
    const agent = agentMap.get(spec.agentKey);
    if (!agent) continue;
    await prisma.agent.update({
      where: { id: agent.id },
      data: { notes: seed.notes },
    });
  }

  console.log("\nLE DOUZE 28–29 mis à jour.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
