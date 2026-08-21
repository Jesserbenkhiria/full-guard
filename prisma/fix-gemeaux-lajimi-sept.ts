/**
 * Les Gémeaux — septembre 2026 (spec Lajimi complète).
 *
 * Run: npx tsx prisma/fix-gemeaux-lajimi-sept.ts
 */
import {
  DayOfWeek,
  PositionRole,
  PrismaClient,
  ShiftType,
} from "@prisma/client";
import { seedAgentSiteRules } from "./seed-agent-site-rules";
import {
  AGENT_CONSTRAINTS,
  constraintToAgentSeed,
  getAgentMaxWeekendsPerMonth,
} from "../src/data/agent-constraints";
import {
  GEMEAUX_REQUIREMENTS,
  toRequirementCreateData,
} from "./site-requirements-lajimi";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";
import { isWeekendDay, weekendPeriodKey } from "../src/lib/planning/weekends";

const prisma = new PrismaClient();

type SlotSpec = {
  date: string;
  startTime: string;
  endTime: string;
  shiftType: ShiftType;
  role: PositionRole;
  agentLastName: string;
};

const NIGHT_POOL = ["YAHMADI", "DIAKITE", "AOUFI"] as const;
const DAY_POOL = ["DJEDIA", "SEITI", "HOUNGUES", "DEMBELE"] as const;
const WEEKEND_NIGHTS: Record<string, string> = {
  "2026-09-05": "AOUFI",
  "2026-09-06": "AOUFI",
  "2026-09-12": "YAHMADI",
  "2026-09-13": "AOUFI",
  "2026-09-19": "YAHMADI",
  "2026-09-20": "YAHMADI",
  "2026-09-26": "DIAKITE",
  "2026-09-27": "DIAKITE",
};
const AOUFI_MAX_SHIFTS = 5;

function monthDays2026_09(): string[] {
  const out: string[] = [];
  for (let d = 1; d <= 30; d++) {
    out.push(`2026-09-${String(d).padStart(2, "0")}`);
  }
  return out;
}

function prevDateKey(dateKey: string): string {
  const d = parseDateKey(dateKey);
  d.setUTCDate(d.getUTCDate() - 1);
  return toDateKey(d);
}

function agentKeyFromLast(lastName: string): string {
  const spec = AGENT_CONSTRAINTS.find((c) => c.lastName === lastName);
  return spec?.agentKey ?? lastName;
}

function canWorkWeekend(
  lastName: string,
  dateKey: string,
  weekendCounts: Map<string, Set<string>>
): boolean {
  if (!isWeekendDay(parseDateKey(dateKey))) return true;
  const key = agentKeyFromLast(lastName);
  const max = getAgentMaxWeekendsPerMonth(key) ?? 2;
  const wk = weekendPeriodKey(parseDateKey(dateKey));
  const set = weekendCounts.get(lastName) ?? new Set();
  if (set.has(wk)) return true;
  return set.size < max;
}

function trackWeekend(
  lastName: string,
  dateKey: string,
  weekendCounts: Map<string, Set<string>>
) {
  if (!isWeekendDay(parseDateKey(dateKey))) return;
  const set = weekendCounts.get(lastName) ?? new Set();
  set.add(weekendPeriodKey(parseDateKey(dateKey)));
  weekendCounts.set(lastName, set);
}

function evinaOk(dateKey: string, day: DayOfWeek): boolean {
  if (dateKey >= "2026-09-14") return false;
  if (day === DayOfWeek.FRIDAY) return false;
  return true;
}

function consecutiveStreakIfAdded(
  workDates: Map<string, Set<string>>,
  lastName: string,
  dateKey: string
): number {
  const dates = new Set(workDates.get(lastName) ?? []);
  dates.add(dateKey);
  let streak = 0;
  let d = parseDateKey(dateKey);
  while (dates.has(toDateKey(d))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  d = parseDateKey(dateKey);
  d.setUTCDate(d.getUTCDate() + 1);
  while (dates.has(toDateKey(d))) {
    streak++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return streak;
}

function buildSchedule(opts: { yahmadiBlockedDates: Set<string> }): SlotSpec[] {
  const slots: SlotSpec[] = [];
  const weekendCounts = new Map<string, Set<string>>();
  const shiftCounts = new Map<string, number>();
  const dayWorkers = new Map<string, Set<string>>();
  const nightWorkers = new Map<string, string>();
  const workDates = new Map<string, Set<string>>();
  let aoufiShifts = 0;
  let fridayChefDiakite = false;
  let nightToggle = 0;

  const SAT_CHEF: Record<string, string> = {
    "2026-09-05": "LAJIMI",
    "2026-09-12": "DJEDIA",
    "2026-09-19": "DJEDIA",
    "2026-09-26": "LAJIMI",
  };

  const commit = (slot: SlotSpec) => {
    slots.push(slot);
    shiftCounts.set(slot.agentLastName, (shiftCounts.get(slot.agentLastName) ?? 0) + 1);
    trackWeekend(slot.agentLastName, slot.date, weekendCounts);
    const wd = workDates.get(slot.agentLastName) ?? new Set();
    wd.add(slot.date);
    workDates.set(slot.agentLastName, wd);
    if (slot.shiftType === ShiftType.DAY) {
      const set = dayWorkers.get(slot.date) ?? new Set();
      set.add(slot.agentLastName);
      dayWorkers.set(slot.date, set);
    } else {
      nightWorkers.set(slot.date, slot.agentLastName);
    }
  };

  const tooManyConsecutive = (lastName: string, dateKey: string) =>
    consecutiveStreakIfAdded(workDates, lastName, dateKey) > 5;

  const pickDay = (dateKey: string, exclude: Set<string>, count = 1): string[] => {
    const day = getDayOfWeek(parseDateKey(dateKey));
    const prevNight = nightWorkers.get(prevDateKey(dateKey));
    const pool = [...DAY_POOL];
    if (evinaOk(dateKey, day)) pool.push("EVINA");

    const chosen: string[] = [];
    const sorted = pool
      .filter((n) => !exclude.has(n))
      .filter((n) => n !== prevNight)
      .filter((n) => !tooManyConsecutive(n, dateKey))
      .filter((n) => canWorkWeekend(n, dateKey, weekendCounts))
      .sort((a, b) => (shiftCounts.get(a) ?? 0) - (shiftCounts.get(b) ?? 0));

    for (const name of sorted) {
      if (chosen.length >= count) break;
      chosen.push(name);
      exclude.add(name);
    }
    return chosen;
  };

  const pickNight = (dateKey: string, exclude: Set<string> = new Set()): string => {
    const preset = WEEKEND_NIGHTS[dateKey];
    if (preset && !exclude.has(preset) && !(preset === "YAHMADI" && opts.yahmadiBlockedDates.has(dateKey))) {
      if (preset === "AOUFI") aoufiShifts++;
      return preset;
    }
    if (isWeekendDay(parseDateKey(dateKey))) {
      throw new Error(`Nuit week-end non planifiée : ${dateKey}`);
    }

    const dayBlock = dayWorkers.get(dateKey) ?? new Set();
    const pool = ["YAHMADI", "AOUFI", "DIAKITE"] as const;

    for (let i = 0; i < pool.length; i++) {
      const name = pool[(nightToggle + i) % pool.length];
      if (exclude.has(name) || dayBlock.has(name)) continue;
      if (name === "YAHMADI" && opts.yahmadiBlockedDates.has(dateKey)) continue;
      if (name === "AOUFI" && aoufiShifts >= AOUFI_MAX_SHIFTS) continue;
      if (tooManyConsecutive(name, dateKey)) continue;
      if (!canWorkWeekend(name, dateKey, weekendCounts)) continue;
      if (name === "AOUFI") aoufiShifts++;
      nightToggle = (nightToggle + 1) % pool.length;
      return name;
    }

    return "DIAKITE";
  };

  for (const dateKey of monthDays2026_09()) {
    const day = getDayOfWeek(parseDateKey(dateKey));
    const usedToday = new Set<string>();

    if (day === DayOfWeek.SATURDAY) {
      const satChef = SAT_CHEF[dateKey] ?? "DJEDIA";
      commit({
        date: dateKey,
        startTime: "07:00",
        endTime: "19:00",
        shiftType: ShiftType.DAY,
        role: PositionRole.TEAM_LEADER,
        agentLastName: satChef,
      });
      usedToday.add(satChef);

      const satAgent = pickDay(dateKey, usedToday, 1)[0] ?? "SEITI";
      commit({
        date: dateKey,
        startTime: "08:00",
        endTime: "17:45",
        shiftType: ShiftType.DAY,
        role: PositionRole.AGENT,
        agentLastName: satAgent,
      });

      commit({
        date: dateKey,
        startTime: "19:00",
        endTime: "07:00",
        shiftType: ShiftType.NIGHT,
        role: PositionRole.AGENT,
        agentLastName: pickNight(dateKey, usedToday),
      });
      continue;
    }

    if (day === DayOfWeek.SUNDAY) {
      const sunDay = pickDay(dateKey, usedToday, 1)[0] ?? "SEITI";
      commit({
        date: dateKey,
        startTime: "07:00",
        endTime: "19:00",
        shiftType: ShiftType.DAY,
        role: PositionRole.AGENT,
        agentLastName: sunDay,
      });

      commit({
        date: dateKey,
        startTime: "19:00",
        endTime: "07:00",
        shiftType: ShiftType.NIGHT,
        role: PositionRole.AGENT,
        agentLastName: pickNight(dateKey),
      });
      continue;
    }

    let chef = "LAJIMI";
    if (day === DayOfWeek.FRIDAY) {
      const prevNight = nightWorkers.get(prevDateKey(dateKey));
      const wantDiakite = fridayChefDiakite;
      fridayChefDiakite = !fridayChefDiakite;
      if (wantDiakite && prevNight !== "DIAKITE" && !tooManyConsecutive("DIAKITE", dateKey)) {
        chef = "DIAKITE";
      } else {
        chef = "DJEDIA";
      }
    }
    commit({
      date: dateKey,
      startTime: "07:00",
      endTime: "19:00",
      shiftType: ShiftType.DAY,
      role: PositionRole.TEAM_LEADER,
      agentLastName: chef,
    });
    usedToday.add(chef);

    for (const name of pickDay(dateKey, usedToday, 2)) {
      commit({
        date: dateKey,
        startTime: "07:00",
        endTime: "19:00",
        shiftType: ShiftType.DAY,
        role: PositionRole.AGENT,
        agentLastName: name,
      });
    }

    commit({
      date: dateKey,
      startTime: "19:00",
      endTime: "07:00",
      shiftType: ShiftType.NIGHT,
      role: PositionRole.AGENT,
      agentLastName: pickNight(dateKey, usedToday),
    });
  }

  return slots;
}

async function main() {
  const gemaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux" } },
  });
  const month = await prisma.planningMonth.findFirst({
    where: { year: 2026, month: 9 },
  });
  if (!gemaux || !month) throw new Error("Gémeaux / septembre 2026 introuvable");

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

  const sites = await prisma.site.findMany();
  const siteByKey: Record<string, (typeof sites)[0]> = {};
  for (const site of sites) {
    if (site.name.includes("Gémeaux")) siteByKey.GEMEAUX = site;
    else if (site.name.includes("VISAGE")) siteByKey.VISAGE = site;
    else if (site.name.includes("ORDINAL")) siteByKey.ORDINAL = site;
    else if (site.name.includes("DOUZE")) siteByKey["LE DOUZE"] = site;
    else if (site.name.includes("PLEYEL")) siteByKey.PLEYEL = site;
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

  await seedAgentSiteRules(prisma, agentMap, siteByKey);

  for (const spec of AGENT_CONSTRAINTS) {
    const seed = constraintToAgentSeed(spec);
    const agent = agentMap.get(spec.agentKey) ?? agentMap.get(spec.lastName);
    if (!agent) continue;
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        contractHours: seed.contractHours,
        overtimeAllowed: seed.overtimeAllowed,
        canWorkNight: seed.canWorkNight,
        dayOnly: seed.dayOnly,
        nightForbidden: seed.nightForbidden,
        isTeamLeader: seed.isTeamLeader ?? false,
        preferredDays: seed.preferredDays,
        notes: seed.notes,
        maxVacationsPerMonth: seed.maxVacationsPerMonth,
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

  const evina = agentMap.get("Pierre Marie_EVINA") ?? agentMap.get("EVINA");
  if (evina) {
    await prisma.vacation.deleteMany({
      where: {
        agentId: evina.id,
        startDate: { gte: new Date("2026-09-01T12:00:00.000Z") },
      },
    });
    await prisma.vacation.create({
      data: {
        agentId: evina.id,
        startDate: new Date("2026-09-14T12:00:00.000Z"),
        endDate: new Date("2026-09-30T12:00:00.000Z"),
        reason: "Congé Gémeaux — disponible LE DOUZE vendredis",
      },
    });
  }

  const yahmadi = agentMap.get("YAHMADI");
  const visage = siteByKey.VISAGE;
  const yahmadiBlockedDates = new Set<string>();
  if (yahmadi && visage) {
    const visageShifts = await prisma.assignment.findMany({
      where: {
        agentId: yahmadi.id,
        planningMonthId: month.id,
        siteId: visage.id,
      },
    });
    for (const a of visageShifts) {
      yahmadiBlockedDates.add(toDateKey(a.date));
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

  const SCHEDULE = buildSchedule({ yahmadiBlockedDates });

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

  console.log(`✓ Les Gémeaux septembre : ${SCHEDULE.length} affectations`);
  if (yahmadiBlockedDates.size > 0) {
    console.log(`  YAHMADI bloqué Gémeaux nuit : ${yahmadiBlockedDates.size} j (VISAGE)`);
  }

  const byAgent = new Map<string, { n: number; h: number; we: Set<string> }>();
  for (const slot of SCHEDULE) {
    const cur = byAgent.get(slot.agentLastName) ?? { n: 0, h: 0, we: new Set() };
    cur.n += 1;
    cur.h += calculateShiftHours(slot.startTime, slot.endTime);
    const d = parseDateKey(slot.date);
    if (isWeekendDay(d)) cur.we.add(weekendPeriodKey(d));
    byAgent.set(slot.agentLastName, cur);
  }
  for (const [name, v] of [...byAgent.entries()].sort()) {
    const flag = v.we.size > 2 ? " ⚠" : "";
    console.log(
      `${name.padEnd(10)} ${String(v.n).padStart(2)} vac  ${Math.round(v.h * 10) / 10}h  ${v.we.size} WE${flag}`
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
