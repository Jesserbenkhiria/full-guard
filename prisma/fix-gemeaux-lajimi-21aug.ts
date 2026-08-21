/**
 * Les Gémeaux — consignes Lajimi (21/08) :
 * 1. YAHMADI jamais VISAGE + Gémeaux le même jour ; plus de nuits
 * 2. Samedi 1 chef + 2 agents (DJEDIA 07-19)
 * 3. HOUNGUES > 120h
 * 4. Plus de journées DEMBELE
 * 5. DIAKITE max 13 vacations
 * 6. Nuits DJEDIA (jour+soir OK)
 * 7. AOUFI : 04 nuit, 11 jour, 21 jour, 23 jour, 27 nuit
 *
 * Run: npx tsx prisma/fix-gemeaux-lajimi-21aug.ts
 */
import {
  DayOfWeek,
  PositionRole,
  PrismaClient,
  ShiftType,
} from "@prisma/client";
import {
  GEMEAUX_REQUIREMENTS,
  toRequirementCreateData,
} from "./site-requirements-lajimi";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

type Slot = {
  date: string;
  startTime: string;
  endTime: string;
  shiftType: ShiftType;
  role: PositionRole;
  agentLastName: string;
};

const NIGHT: Pick<Slot, "startTime" | "endTime" | "shiftType" | "role"> = {
  startTime: "19:00",
  endTime: "07:00",
  shiftType: ShiftType.NIGHT,
  role: PositionRole.AGENT,
};
const DAY: Pick<Slot, "startTime" | "endTime" | "shiftType" | "role"> = {
  startTime: "07:00",
  endTime: "19:00",
  shiftType: ShiftType.DAY,
  role: PositionRole.AGENT,
};
const CHEF: Pick<Slot, "startTime" | "endTime" | "shiftType" | "role"> = {
  startTime: "07:00",
  endTime: "19:00",
  shiftType: ShiftType.DAY,
  role: PositionRole.TEAM_LEADER,
};

const NIGHTS: Record<string, string> = {
  "2026-09-01": "YAHMADI",
  "2026-09-02": "DJEDIA",
  "2026-09-03": "YAHMADI",
  "2026-09-04": "AOUFI",
  "2026-09-05": "YAHMADI",
  "2026-09-06": "YAHMADI",
  "2026-09-07": "DIAKITE",
  "2026-09-08": "YAHMADI",
  "2026-09-09": "DJEDIA",
  "2026-09-10": "YAHMADI",
  "2026-09-11": "DIAKITE",
  "2026-09-12": "YAHMADI",
  "2026-09-13": "DIAKITE",
  "2026-09-14": "DIAKITE",
  "2026-09-15": "DIAKITE",
  "2026-09-16": "DIAKITE",
  "2026-09-17": "DIAKITE",
  "2026-09-18": "DJEDIA",
  "2026-09-19": "YAHMADI",
  "2026-09-20": "YAHMADI",
  "2026-09-21": "DJEDIA",
  "2026-09-22": "DIAKITE",
  "2026-09-23": "DIAKITE",
  "2026-09-24": "DJEDIA",
  "2026-09-25": "YAHMADI",
  "2026-09-26": "YAHMADI",
  "2026-09-27": "AOUFI",
  "2026-09-28": "DIAKITE",
  "2026-09-29": "DIAKITE",
  "2026-09-30": "DIAKITE",
};

const WEEKDAY_AGENTS: Record<string, [string, string]> = {
  "2026-09-01": ["DJEDIA", "SEITI"],
  "2026-09-02": ["HOUNGUES", "DEMBELE"],
  "2026-09-03": ["EVINA", "DJEDIA"],
  "2026-09-04": ["HOUNGUES", "SEITI"],
  "2026-09-07": ["SEITI", "HOUNGUES"],
  "2026-09-08": ["EVINA", "DEMBELE"],
  "2026-09-09": ["DJEDIA", "HOUNGUES"],
  "2026-09-10": ["DEMBELE", "SEITI"],
  "2026-09-11": ["AOUFI", "SEITI"],
  "2026-09-14": ["DEMBELE", "SEITI"],
  "2026-09-15": ["HOUNGUES", "DEMBELE"],
  "2026-09-16": ["DJEDIA", "SEITI"],
  "2026-09-17": ["HOUNGUES", "DEMBELE"],
  "2026-09-18": ["HOUNGUES", "DEMBELE"],
  "2026-09-21": ["AOUFI", "DEMBELE"],
  "2026-09-22": ["DJEDIA", "HOUNGUES"],
  "2026-09-23": ["AOUFI", "DEMBELE"],
  "2026-09-24": ["DJEDIA", "SEITI"],
  "2026-09-25": ["HOUNGUES", "DEMBELE"],
  "2026-09-28": ["DEMBELE", "DJEDIA"],
  "2026-09-29": ["SEITI", "HOUNGUES"],
  "2026-09-30": ["DEMBELE", "DJEDIA"],
};

const SAT_SHORT: Record<string, string> = {
  "2026-09-05": "DEMBELE",
  "2026-09-12": "EVINA",
  "2026-09-19": "DEMBELE",
  "2026-09-26": "DEMBELE",
};

const SUN_DAY: Record<string, string> = {
  "2026-09-06": "EVINA",
  "2026-09-13": "DEMBELE",
  "2026-09-20": "DEMBELE",
  "2026-09-27": "HOUNGUES",
};

function buildSchedule(): Slot[] {
  const slots: Slot[] = [];
  for (let d = 1; d <= 30; d++) {
    const date = `2026-09-${String(d).padStart(2, "0")}`;
    const dow = getDayOfWeek(new Date(`${date}T12:00:00.000Z`));

    if (dow === DayOfWeek.SATURDAY) {
      slots.push({ date, ...CHEF, agentLastName: "LAJIMI" });
      slots.push({ date, ...DAY, agentLastName: "DJEDIA" });
      slots.push({
        date,
        startTime: "08:00",
        endTime: "17:45",
        shiftType: ShiftType.DAY,
        role: PositionRole.AGENT,
        agentLastName: SAT_SHORT[date],
      });
    } else if (dow === DayOfWeek.SUNDAY) {
      slots.push({ date, ...DAY, agentLastName: SUN_DAY[date] });
    } else if (dow === DayOfWeek.FRIDAY) {
      slots.push({ date, ...CHEF, agentLastName: "DJEDIA" });
      for (const name of WEEKDAY_AGENTS[date]) {
        slots.push({ date, ...DAY, agentLastName: name });
      }
    } else {
      slots.push({ date, ...CHEF, agentLastName: "LAJIMI" });
      for (const name of WEEKDAY_AGENTS[date]) {
        slots.push({ date, ...DAY, agentLastName: name });
      }
    }

    slots.push({ date, ...NIGHT, agentLastName: NIGHTS[date] });
  }
  return slots;
}

async function main() {
  const gemaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
  });
  const visage = await prisma.site.findFirst({
    where: { name: "VISAGE DU MONDE" },
  });
  const month = await prisma.planningMonth.findFirst({
    where: { year: 2026, month: 9 },
  });
  if (!gemaux || !month) throw new Error("Gémeaux / septembre introuvable");

  await prisma.siteRequirement.deleteMany({ where: { siteId: gemaux.id } });
  await prisma.siteRequirement.createMany({
    data: GEMEAUX_REQUIREMENTS.map((req) => ({
      siteId: gemaux.id,
      ...toRequirementCreateData(req),
    })),
  });
  const gemauxWithReqs = await prisma.site.findFirst({
    where: { id: gemaux.id },
    include: { requirements: { where: { active: true } } },
  });
  if (!gemauxWithReqs) throw new Error("Gémeaux introuvable");

  const agents = await prisma.agent.findMany();
  const agentMap = new Map<string, (typeof agents)[0]>();
  for (const a of agents) {
    agentMap.set(a.lastName, a);
  }

  await prisma.agent.update({
    where: { id: agentMap.get("HOUNGUES")!.id },
    data: { overtimeAllowed: true },
  });
  await prisma.agent.update({
    where: { id: agentMap.get("DEMBELE")!.id },
    data: { overtimeAllowed: true },
  });

  const yahmadiVisageDates = new Set<string>();
  const yahmadi = agentMap.get("YAHMADI");
  if (yahmadi && visage) {
    const vis = await prisma.assignment.findMany({
      where: {
        agentId: yahmadi.id,
        siteId: visage.id,
        planningMonthId: month.id,
      },
    });
    for (const a of vis) yahmadiVisageDates.add(toDateKey(a.date));
  }

  const SCHEDULE = buildSchedule();
  for (const slot of SCHEDULE) {
    if (slot.agentLastName === "YAHMADI" && yahmadiVisageDates.has(slot.date)) {
      throw new Error(`YAHMADI Gémeaux+VISAGE le ${slot.date}`);
    }
  }

  const existing = await prisma.assignment.findMany({
    where: { siteId: gemaux.id, planningMonthId: month.id },
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
    const day = getDayOfWeek(date);
    const req = gemauxWithReqs.requirements.find((r) => {
      if (r.startTime !== slot.startTime || r.endTime !== slot.endTime) return false;
      if (r.shiftType !== slot.shiftType) return false;
      if ((r.role ?? PositionRole.AGENT) !== slot.role) return false;
      return r.days.includes(day);
    });
    await prisma.assignment.create({
      data: {
        planningMonthId: month.id,
        agentId: agent.id,
        siteId: gemaux.id,
        requirementId: req?.id ?? null,
        date,
        shiftType: slot.shiftType,
        role: slot.role,
        startTime: slot.startTime,
        endTime: slot.endTime,
        hours: calculateShiftHours(slot.startTime, slot.endTime),
      },
    });
  }

  const byAgent = new Map<string, { n: number; h: number }>();
  for (const slot of SCHEDULE) {
    const cur = byAgent.get(slot.agentLastName) ?? { n: 0, h: 0 };
    cur.n += 1;
    cur.h += calculateShiftHours(slot.startTime, slot.endTime);
    byAgent.set(slot.agentLastName, cur);
  }
  console.log(`✓ Les Gémeaux : ${SCHEDULE.length} affectations`);
  for (const [name, v] of [...byAgent.entries()].sort()) {
    console.log(
      `${name.padEnd(10)} ${String(v.n).padStart(2)} vac  ${Math.round(v.h * 10) / 10}h`
    );
  }

  const { validateSitePlanningGate } = await import(
    "../src/services/rules/validate-site-planning-gate"
  );
  const gate = await validateSitePlanningGate(month.id, gemaux.id);
  if (gate.canValidate) {
    console.log("\n✓ Les Gémeaux validé");
  } else {
    console.log(`\n✗ Non validé: ${gate.blockingMessages.join(" · ")}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
