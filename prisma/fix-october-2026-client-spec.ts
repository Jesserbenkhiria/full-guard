/**
 * Octobre 2026 — spec client finale (Gémeaux, Pleyel, Médiathèque).
 * IDEMPOTENT — peut être re-exécuté sans double-comptage.
 *
 * Run:          npx tsx prisma/fix-october-2026-client-spec.ts
 * + validation: npx tsx prisma/fix-october-2026-client-spec.ts --validate
 */
import {
  AgentSiteRuleType,
  DayOfWeek,
  PositionRole,
  PrismaClient,
  ShiftType,
  SiteRestrictionType,
} from "@prisma/client";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";
import { validatePlanningMonth } from "../src/services/rules/validate-assignment";

const prisma = new PrismaClient();

// ─── Constants ───────────────────────────────────────────────────────────────

const MON_TUE_SAT = new Set<DayOfWeek>([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.SATURDAY,
]);

const MON_TUE_WED_THU_SAT = new Set<DayOfWeek>([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
]);

const WEEKEND = new Set<DayOfWeek>([DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]);

const FRI_SAT_SUN = new Set<DayOfWeek>([
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
]);

const MED_WEEK1_DAYS = new Set<DayOfWeek>([DayOfWeek.WEDNESDAY, DayOfWeek.SATURDAY]);
const MED_WEEK2_DAYS = new Set<DayOfWeek>([
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
]);

// Médiathèque shift schedules — source of truth (spec client 14/09/2026)
// Période 1 (1–17 oct) : mercredi + samedi uniquement
// Période 2 (19–31 oct — vacances scolaires) : mardi + mercredi + vendredi + samedi
const MED_SHIFTS_OCT = [
  // ── Période 1 : 1–17 octobre ── (5 vacations, 41 h)
  { date: "2026-10-03", s: "10:00", e: "18:00", label: "Sam 03/10 10h–18h" },   // SAM
  { date: "2026-10-07", s: "10:00", e: "18:30", label: "Mer 07/10 10h–18h30" }, // MER
  { date: "2026-10-10", s: "10:00", e: "18:00", label: "Sam 10/10 10h–18h" },   // SAM
  { date: "2026-10-14", s: "10:00", e: "18:30", label: "Mer 14/10 10h–18h30" }, // MER
  { date: "2026-10-17", s: "10:00", e: "18:00", label: "Sam 17/10 10h–18h" },   // SAM
  // ── Période 2 : 19–31 octobre (vacances scolaires) ── (8 vacations, 55 h)
  { date: "2026-10-20", s: "13:00", e: "18:30", label: "Mar 20/10 13h–18h30" }, // MAR
  { date: "2026-10-21", s: "10:00", e: "18:30", label: "Mer 21/10 10h–18h30" }, // MER
  { date: "2026-10-23", s: "13:00", e: "18:30", label: "Ven 23/10 13h–18h30" }, // VEN
  { date: "2026-10-24", s: "10:00", e: "18:00", label: "Sam 24/10 10h–18h" },   // SAM
  { date: "2026-10-27", s: "13:00", e: "18:30", label: "Mar 27/10 13h–18h30" }, // MAR
  { date: "2026-10-28", s: "10:00", e: "18:30", label: "Mer 28/10 10h–18h30" }, // MER
  { date: "2026-10-30", s: "13:00", e: "18:30", label: "Ven 30/10 13h–18h30" }, // VEN
  { date: "2026-10-31", s: "10:00", e: "18:00", label: "Sam 31/10 10h–18h" },   // SAM
] as const;

// October 2026 days
const OCT_DAYS = Array.from({ length: 31 }, (_, i) =>
  `2026-10-${String(i + 1).padStart(2, "0")}`
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNight(shiftType: ShiftType, startTime: string, endTime: string): boolean {
  return shiftType === ShiftType.NIGHT || endTime < startTime;
}

function isDay(shiftType: ShiftType, startTime: string, endTime: string): boolean {
  return !isNight(shiftType, startTime, endTime);
}

// ─── 1. Update agent profiles & site rules ───────────────────────────────────

type AgentSpec = {
  lastName: string;
  contractHours: number | null;
  canWorkNight: boolean;
  dayOnly: boolean;
  nightForbidden: boolean;
  preferredDays: DayOfWeek[];
  sites: {
    siteKey: string;
    ruleType: AgentSiteRuleType;
    allowedDays?: DayOfWeek[];
    fixedStartTime?: string;
    fixedEndTime?: string;
  }[];
  notes: string;
};

async function updateAgent(
  spec: AgentSpec,
  siteById: Record<string, string>
) {
  const agent = await prisma.agent.findFirst({
    where: { lastName: spec.lastName, active: true },
  });
  if (!agent) {
    console.warn(`⚠ Agent introuvable: ${spec.lastName}`);
    return null;
  }

  // Compute siteRestrictionType
  const hasOnly = spec.sites.some((s) => s.ruleType === AgentSiteRuleType.ONLY);
  const hasPref = spec.sites.some((s) => s.ruleType === AgentSiteRuleType.PREFERRED);
  const siteRestrictionType =
    spec.sites.length === 0
      ? SiteRestrictionType.ANY
      : hasOnly
        ? SiteRestrictionType.ONLY
        : SiteRestrictionType.PREFERRED;

  const allowedIds = spec.sites
    .filter((s) => s.ruleType === AgentSiteRuleType.ONLY)
    .map((s) => siteById[s.siteKey])
    .filter((id): id is string => Boolean(id));

  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      contractHours: spec.contractHours,
      canWorkNight: spec.canWorkNight,
      dayOnly: spec.dayOnly,
      nightForbidden: spec.nightForbidden,
      preferredDays: spec.preferredDays,
      notes: spec.notes,
      siteRestrictionType,
      allowedSiteIds: allowedIds,
    },
  });

  await prisma.agentSiteRule.deleteMany({ where: { agentId: agent.id } });
  for (const s of spec.sites) {
    const siteId = siteById[s.siteKey];
    if (!siteId) continue;
    await prisma.agentSiteRule.create({
      data: {
        agentId: agent.id,
        siteId,
        ruleType: s.ruleType,
        allowedDays: s.allowedDays ?? [],
        fixedStartTime: s.fixedStartTime,
        fixedEndTime: s.fixedEndTime,
        active: true,
        notes: spec.notes,
      },
    });
  }

  console.log(`✓ Profil: ${spec.lastName}`);
  return agent;
}

async function syncAgentProfiles(sites: Record<string, string>) {
  const SPECS: AgentSpec[] = [
    {
      lastName: "DJEDIA",
      contractHours: 156,
      canWorkNight: false,
      dayOnly: true,
      nightForbidden: true,
      preferredDays: [...MON_TUE_SAT],
      sites: [
        {
          siteKey: "GEMEAUX",
          ruleType: AgentSiteRuleType.ONLY,
          allowedDays: [...MON_TUE_SAT],
          fixedStartTime: "07:00",
          fixedEndTime: "19:00",
        },
      ],
      notes: "✅ Oct.2026 : 156 h / 13 vac — lun/mar/sam journée 07h-19h",
    },
    {
      lastName: "DIAKITE",
      contractHours: 156,
      canWorkNight: true,
      dayOnly: false,
      nightForbidden: false,
      preferredDays: [],
      sites: [{ siteKey: "GEMEAUX", ruleType: AgentSiteRuleType.ONLY }],
      notes: "✅ Oct.2026 : 156 h / 13 vac nuit — dès 19/10 : ven/sam/dim nuit uniquement",
    },
    {
      lastName: "DEMBELE",
      contractHours: 156,
      canWorkNight: false,
      dayOnly: true,
      nightForbidden: true,
      preferredDays: [],
      sites: [{ siteKey: "GEMEAUX", ruleType: AgentSiteRuleType.ONLY }],
      notes: "✅ Oct.2026 : 156 h / 13 vac journée",
    },
    {
      lastName: "SEITI",
      contractHours: 156,
      canWorkNight: false,
      dayOnly: true,
      nightForbidden: true,
      preferredDays: [],
      sites: [{ siteKey: "GEMEAUX", ruleType: AgentSiteRuleType.ONLY }],
      notes: "✅ Oct.2026 : 156 h / 13 vac journée",
    },
    {
      lastName: "HOUNGUES",
      contractHours: 120,
      canWorkNight: false,
      dayOnly: true,
      nightForbidden: true,
      preferredDays: [],
      sites: [{ siteKey: "GEMEAUX", ruleType: AgentSiteRuleType.ONLY }],
      notes: "✅ Oct.2026 : 120 h journée",
    },
    {
      lastName: "EVINA",
      contractHours: 80,
      canWorkNight: false,
      dayOnly: true,
      nightForbidden: true,
      preferredDays: [DayOfWeek.FRIDAY],
      sites: [
        { siteKey: "GEMEAUX", ruleType: AgentSiteRuleType.PREFERRED },
        { siteKey: "LE DOUZE", ruleType: AgentSiteRuleType.PREFERRED, fixedStartTime: "08:45", fixedEndTime: "16:45" },
      ],
      notes: "✅ Oct.2026 : 80 h — vendredis SSIAP 2 jour de préférence",
    },
    {
      lastName: "DORCE",
      contractHours: 156,
      canWorkNight: true,
      dayOnly: false,
      nightForbidden: false,
      preferredDays: [],
      sites: [
        { siteKey: "PLEYEL", ruleType: AgentSiteRuleType.PREFERRED },
        { siteKey: "GEMEAUX", ruleType: AgentSiteRuleType.PREFERRED },
      ],
      notes: "✅ Oct.2026 : PLEYEL + Gémeaux — jamais les deux le même jour. Reprend le 15/10.",
    },
    {
      lastName: "CHARGUI",
      contractHours: 156,
      canWorkNight: true,
      dayOnly: false,
      nightForbidden: false,
      preferredDays: [...WEEKEND],
      sites: [{ siteKey: "GEMEAUX", ruleType: AgentSiteRuleType.PREFERRED, allowedDays: [...WEEKEND] }],
      notes: "✅ Oct.2026 : Gémeaux sam/dim uniquement — volume minimal",
    },
    {
      lastName: "KIBRI",
      contractHours: 156,
      canWorkNight: false,
      dayOnly: true,
      nightForbidden: true,
      preferredDays: [],
      sites: [
        {
          siteKey: "MEDIATHEQUE",
          ruleType: AgentSiteRuleType.ONLY,
          allowedDays: [...MED_WEEK2_DAYS],
        },
        { siteKey: "GEMEAUX", ruleType: AgentSiteRuleType.PREFERRED },
        { siteKey: "PLEYEL", ruleType: AgentSiteRuleType.PREFERRED },
      ],
      notes: "✅ Oct.2026 : Médiathèque + Gémeaux/Pleyel — jamais Médiathèque+autre le même jour",
    },
    {
      lastName: "LAJIMI",
      contractHours: 156,
      canWorkNight: false,
      dayOnly: true,
      nightForbidden: true,
      preferredDays: [...MON_TUE_WED_THU_SAT],
      sites: [
        {
          siteKey: "GEMEAUX",
          ruleType: AgentSiteRuleType.ONLY,
          allowedDays: [...MON_TUE_WED_THU_SAT],
          fixedStartTime: "07:00",
          fixedEndTime: "19:00",
        },
      ],
      notes: "✅ Oct.2026 : chef SSIAP 2 — lun/mar/mer/jeu/sam journée",
    },
  ];

  for (const spec of SPECS) {
    await updateAgent(spec, sites);
  }
}

// ─── 2. Médiathèque requirements + assignments (atomic reset) ─────────────────

async function resetMediatheque(
  planningMonthId: string,
  medId: string,
  kibriId: string
) {
  // Delete ALL Médiathèque assignments for October (prevents stale requirementId)
  const deleted = await prisma.assignment.deleteMany({
    where: { planningMonthId, siteId: medId },
  });
  if (deleted.count > 0) console.log(`  → ${deleted.count} anciennes affectations Médiathèque supprimées`);

  // Deactivate recurring requirements, delete existing Oct-specific ones
  await prisma.siteRequirement.updateMany({
    where: { siteId: medId, specificDate: null },
    data: { active: false },
  });
  await prisma.siteRequirement.deleteMany({
    where: { siteId: medId, specificDate: { not: null } },
  });

  // Create fresh requirements and immediately assign KIBRI
  let hoursTotal = 0;
  let countTotal = 0;
  for (const shift of MED_SHIFTS_OCT) {
    const req = await prisma.siteRequirement.create({
      data: {
        siteId: medId,
        label: shift.label,
        days: [],
        shiftType: ShiftType.DAY,
        startTime: shift.s,
        endTime: shift.e,
        role: PositionRole.AGENT,
        agentCount: 1,
        priority: 1,
        active: true,
        specificDate: new Date(`${shift.date}T12:00:00.000Z`),
      },
    });

    const h = calculateShiftHours(shift.s, shift.e);
    await prisma.assignment.create({
      data: {
        planningMonthId,
        agentId: kibriId,
        siteId: medId,
        requirementId: req.id,
        date: new Date(`${shift.date}T12:00:00.000Z`),
        shiftType: ShiftType.DAY,
        role: PositionRole.AGENT,
        startTime: shift.s,
        endTime: shift.e,
        hours: h,
        notes: "fix-oct-2026 Médiathèque",
      },
    });
    hoursTotal += h;
    countTotal++;
  }

  console.log(`✓ Médiathèque: ${countTotal} postes + affectations KIBRI créés (${hoursTotal.toFixed(1)} h)`);
}

// ─── 3. KIBRI at PLEYEL weeks 1-2 (1–14 Oct, days not at Médiathèque) ────────

async function addKibriPleyel(
  planningMonthId: string,
  pleyelId: string,
  kibriId: string
) {
  // Med dates set (busy at Médiathèque)
  const medBusy = new Set(MED_SHIFTS_OCT.filter((s) => s.date <= "2026-10-17").map((s) => s.date));

  const allPleyReqs = await prisma.siteRequirement.findMany({
    where: { siteId: pleyelId, active: true },
  });
  const pleyReqs = allPleyReqs.filter((r) => r.specificDate === null && r.shiftType === ShiftType.DAY);

  const existing = await prisma.assignment.findMany({
    where: { planningMonthId, agentId: kibriId },
  });
  const busyDates = new Set(existing.map((a) => toDateKey(a.date)));

  const pleyExisting = await prisma.assignment.findMany({
    where: { planningMonthId, siteId: pleyelId },
  });
  const pleyelSlots = new Map<string, number>();
  for (const a of pleyExisting) {
    const k = `${toDateKey(a.date)}|${a.startTime}|${a.endTime}`;
    pleyelSlots.set(k, (pleyelSlots.get(k) ?? 0) + 1);
  }

  let created = 0;
  // Only 1–14 October (before DORCE returns on 15 Oct)
  for (const dateKey of OCT_DAYS.filter((d) => d <= "2026-10-14")) {
    if (medBusy.has(dateKey)) continue; // at Médiathèque this day
    if (busyDates.has(dateKey)) continue;

    const day = getDayOfWeek(parseDateKey(dateKey));
    for (const req of pleyReqs) {
      if (!req.days.includes(day)) continue;
      const slotKey = `${dateKey}|${req.startTime}|${req.endTime}`;
      if ((pleyelSlots.get(slotKey) ?? 0) >= req.agentCount) continue;

      await prisma.assignment.create({
        data: {
          planningMonthId,
          agentId: kibriId,
          siteId: pleyelId,
          requirementId: req.id,
          date: parseDateKey(dateKey),
          shiftType: req.shiftType,
          role: req.role ?? PositionRole.AGENT,
          startTime: req.startTime,
          endTime: req.endTime,
          hours: calculateShiftHours(req.startTime, req.endTime),
          notes: "fix-oct-2026 KIBRI Pleyel sem.1-2",
        },
      });
      busyDates.add(dateKey);
      pleyelSlots.set(slotKey, (pleyelSlots.get(slotKey) ?? 0) + 1);
      created++;
      break;
    }
  }
  if (created > 0) console.log(`✓ KIBRI: ${created} vacation(s) Pleyel (1–14 oct.)`);
}

// ─── 4. Clean up assignments that violate new constraints ─────────────────────

async function cleanupOctober(
  planningMonthId: string,
  gemeauxId: string,
  pleyelId: string
) {
  const allAgents = await prisma.agent.findMany();
  const agentById = new Map(allAgents.map((a) => [a.id, a]));

  const rows = await prisma.assignment.findMany({
    where: { planningMonthId, siteId: gemeauxId },
    orderBy: { date: "asc" },
  });

  const toDelete: string[] = [];
  const keepById = new Set<string>();

  for (const a of rows) {
    const agent = agentById.get(a.agentId);
    if (!agent) continue;
    const ln = agent.lastName.toUpperCase();
    const dateKey = toDateKey(a.date);
    const day = getDayOfWeek(a.date);
    const night = isNight(a.shiftType, a.startTime, a.endTime);

    // CHARGUI: Gémeaux sam/dim only
    if (ln === "CHARGUI" && !WEEKEND.has(day)) { toDelete.push(a.id); continue; }

    // DJEDIA: Gémeaux lun/mar/sam journée only
    if (ln === "DJEDIA") {
      if (!MON_TUE_SAT.has(day) || night) { toDelete.push(a.id); continue; }
    }

    // DIAKITE: night only; from 19/10: Fri/Sat/Sun only
    if (ln === "DIAKITE") {
      if (!night) { toDelete.push(a.id); continue; }
      if (dateKey >= "2026-10-19" && !FRI_SAT_SUN.has(day)) { toDelete.push(a.id); continue; }
    }

    // DEMBELE / SEITI / HOUNGUES: day only
    if ((ln === "DEMBELE" || ln === "SEITI" || ln === "HOUNGUES") && night) {
      toDelete.push(a.id); continue;
    }
  }

  // Pleyel + Gémeaux same day — remove Gémeaux
  const allOct = await prisma.assignment.findMany({
    where: { planningMonthId },
    include: { agent: true },
  });
  const byAgentDate = new Map<string, typeof allOct>();
  for (const a of allOct) {
    if (toDelete.includes(a.id)) continue;
    const k = `${a.agentId}|${toDateKey(a.date)}`;
    const list = byAgentDate.get(k) ?? [];
    list.push(a);
    byAgentDate.set(k, list);
  }
  for (const list of byAgentDate.values()) {
    const pleyel = list.filter((x) => x.siteId === pleyelId);
    const gems = list.filter((x) => x.siteId === gemeauxId);
    if (pleyel.length > 0 && gems.length > 0) {
      gems.forEach((x) => toDelete.push(x.id));
    }
  }

  if (toDelete.length > 0) {
    await prisma.assignment.deleteMany({ where: { id: { in: [...new Set(toDelete)] } } });
    console.log(`✓ ${toDelete.length} affectations nettoyées (règles oct. 2026)`);
  }
}

// ─── 5. Trim to hour/shift caps ───────────────────────────────────────────────

async function trimToCaps(planningMonthId: string) {
  const caps: { lastName: string; maxH: number; maxS: number }[] = [
    { lastName: "DJEDIA", maxH: 156, maxS: 13 },
    { lastName: "DIAKITE", maxH: 156, maxS: 13 },
    { lastName: "DEMBELE", maxH: 156, maxS: 13 },
    { lastName: "SEITI", maxH: 156, maxS: 13 },
    { lastName: "HOUNGUES", maxH: 120, maxS: 10 },
    { lastName: "EVINA", maxH: 80, maxS: 99 },
  ];

  for (const cap of caps) {
    const agent = await prisma.agent.findFirst({ where: { lastName: cap.lastName } });
    if (!agent) continue;
    const list = await prisma.assignment.findMany({
      where: { planningMonthId, agentId: agent.id },
      orderBy: { date: "asc" },
    });
    let h = list.reduce((s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)), 0);
    let cnt = list.length;
    if (h <= cap.maxH && cnt <= cap.maxS) continue;

    // Remove from end (keep earlier dates)
    const toDelete: string[] = [];
    for (const a of [...list].reverse()) {
      if (h <= cap.maxH && cnt <= cap.maxS) break;
      toDelete.push(a.id);
      h -= a.hours ?? calculateShiftHours(a.startTime, a.endTime);
      cnt--;
    }
    await prisma.assignment.deleteMany({ where: { id: { in: toDelete } } });
    console.log(`✓ ${cap.lastName}: ${toDelete.length} vac retirées → ${h.toFixed(1)} h`);
  }
}

// ─── 6. Top-up agents to target hours ─────────────────────────────────────────

async function topUpAgent(
  planningMonthId: string,
  gemeauxId: string,
  lastName: string,
  opts: {
    maxH: number;
    maxS: number;
    dayOnly?: boolean;
    nightOnly?: boolean;
    allowedDays?: Set<DayOfWeek>;
    /** From this date, restrict to these days */
    fromDateRestrict?: { from: string; days: Set<DayOfWeek> };
    /** Don't use same-day Pleyel slots */
    checkPleyel?: string;
    /** Role to fill (default: AGENT) */
    role?: PositionRole;
  }
) {
  const agent = await prisma.agent.findFirst({ where: { lastName, active: true } });
  if (!agent) return;

  const [agentRows, gemeauxRows] = await Promise.all([
    prisma.assignment.findMany({ where: { planningMonthId, agentId: agent.id } }),
    prisma.assignment.findMany({ where: { planningMonthId, siteId: gemeauxId } }),
  ]);

  let h = agentRows.reduce((s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)), 0);
  let cnt = agentRows.length;
  if (h >= opts.maxH && cnt >= opts.maxS) return;

  const busyDates = new Set(agentRows.map((a) => toDateKey(a.date)));
  // Role-aware: TEAM_LEADER and AGENT slots are counted separately
  const slotCount = new Map<string, number>();
  for (const a of gemeauxRows) {
    const k = `${toDateKey(a.date)}|${a.startTime}|${a.endTime}|${a.role}`;
    slotCount.set(k, (slotCount.get(k) ?? 0) + 1);
  }

  let pleyelBusy: Set<string> | null = null;
  if (opts.checkPleyel) {
    const pr = await prisma.assignment.findMany({
      where: { planningMonthId, agentId: agent.id, siteId: opts.checkPleyel },
    });
    pleyelBusy = new Set(pr.map((a) => toDateKey(a.date)));
  }

  const allReqs = await prisma.siteRequirement.findMany({
    where: { siteId: gemeauxId, active: true },
  });
  const targetRole = opts.role ?? PositionRole.AGENT;
  const reqs = allReqs.filter((r) => r.specificDate === null && r.role === targetRole);

  let created = 0;
  for (const dateKey of OCT_DAYS) {
    if (h >= opts.maxH || cnt >= opts.maxS) break;
    if (busyDates.has(dateKey)) continue;
    if (pleyelBusy?.has(dateKey)) continue;

    const day = getDayOfWeek(parseDateKey(dateKey));
    if (opts.allowedDays && !opts.allowedDays.has(day)) continue;
    if (opts.fromDateRestrict && dateKey >= opts.fromDateRestrict.from && !opts.fromDateRestrict.days.has(day)) continue;

    for (const req of reqs) {
      if (!req.days.includes(day)) continue;
      const night = isNight(req.shiftType, req.startTime, req.endTime);
      if (opts.dayOnly && night) continue;
      if (opts.nightOnly && !night) continue;

      const slotKey = `${dateKey}|${req.startTime}|${req.endTime}|${req.role}`;
      if ((slotCount.get(slotKey) ?? 0) >= req.agentCount) continue;

      const sh = calculateShiftHours(req.startTime, req.endTime);
      if (h + sh > opts.maxH + 0.5) continue;

      await prisma.assignment.create({
        data: {
          planningMonthId,
          agentId: agent.id,
          siteId: gemeauxId,
          requirementId: req.id,
          date: parseDateKey(dateKey),
          shiftType: req.shiftType,
          role: targetRole,
          startTime: req.startTime,
          endTime: req.endTime,
          hours: sh,
          notes: `fix-oct-2026 ${lastName}`,
        },
      });
      h += sh;
      cnt++;
      created++;
      busyDates.add(dateKey);
      slotCount.set(slotKey, (slotCount.get(slotKey) ?? 0) + 1);
      break;
    }
  }
  if (created > 0) console.log(`✓ ${lastName}: ${created} vacation(s) ajoutée(s) → ${h.toFixed(1)} h`);
}

// ─── 7. KIBRI top-up on Gémeaux ───────────────────────────────────────────────

async function topUpKibriGemeaux(
  planningMonthId: string,
  gemeauxId: string,
  medId: string,
  kibriId: string
) {
  const existing = await prisma.assignment.findMany({
    where: { planningMonthId, agentId: kibriId },
  });
  let h = existing.reduce((s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)), 0);
  if (h >= 155) return;

  const medBusy = new Set(
    existing.filter((a) => a.siteId === medId).map((a) => toDateKey(a.date))
  );
  const busyDates = new Set(existing.map((a) => toDateKey(a.date)));

  const gemeauxRows = await prisma.assignment.findMany({
    where: { planningMonthId, siteId: gemeauxId },
  });
  const slotCount = new Map<string, number>();
  for (const a of gemeauxRows) {
    const k = `${toDateKey(a.date)}|${a.startTime}|${a.endTime}|${a.role}`;
    slotCount.set(k, (slotCount.get(k) ?? 0) + 1);
  }

  const allGemReqs = await prisma.siteRequirement.findMany({
    where: { siteId: gemeauxId, active: true },
  });
  const reqs = allGemReqs.filter(
    (r) => r.specificDate === null && r.role === PositionRole.AGENT && r.shiftType === ShiftType.DAY
  );

  let created = 0;
  for (const dateKey of OCT_DAYS) {
    if (h >= 156) break;
    if (busyDates.has(dateKey)) continue;
    if (medBusy.has(dateKey)) continue;

    const day = getDayOfWeek(parseDateKey(dateKey));
    for (const req of reqs) {
      if (!req.days.includes(day)) continue;
      const slotKey = `${dateKey}|${req.startTime}|${req.endTime}|${req.role}`;
      if ((slotCount.get(slotKey) ?? 0) >= req.agentCount) continue;

      const sh = calculateShiftHours(req.startTime, req.endTime);
      if (h + sh > 156.5) continue;

      await prisma.assignment.create({
        data: {
          planningMonthId,
          agentId: kibriId,
          siteId: gemeauxId,
          requirementId: req.id,
          date: parseDateKey(dateKey),
          shiftType: ShiftType.DAY,
          role: PositionRole.AGENT,
          startTime: req.startTime,
          endTime: req.endTime,
          hours: sh,
          notes: "fix-oct-2026 KIBRI Gémeaux",
        },
      });
      h += sh;
      created++;
      busyDates.add(dateKey);
      slotCount.set(slotKey, (slotCount.get(slotKey) ?? 0) + 1);
      break;
    }
  }
  if (created > 0) console.log(`✓ KIBRI: ${created} vacation(s) Gémeaux → ${h.toFixed(1)} h`);
}

// ─── 8. Summary ───────────────────────────────────────────────────────────────

async function printSummary(planningMonthId: string) {
  const rows = await prisma.assignment.findMany({
    where: { planningMonthId },
    include: { agent: true, site: true },
  });

  const targets = [
    "LAJIMI", "DJEDIA", "DIAKITE", "DEMBELE", "SEITI",
    "HOUNGUES", "EVINA", "DORCE", "CHARGUI", "KIBRI",
  ];

  console.log("\n--- Bilan octobre 2026 ---");
  for (const name of targets) {
    const list = rows.filter((a) => a.agent.lastName.toUpperCase() === name);
    const h = list.reduce((s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)), 0);
    const sites = [...new Set(list.map((a) => a.site.name))].join(" + ") || "—";
    console.log(`  ${name.padEnd(10)} ${h.toFixed(1).padStart(6)} h  (${String(list.length).padStart(2)} vac)  ${sites}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.includes("--gemeaux-only")) {
    console.log("ℹ Mode --gemeaux-only : délégation à fix-gemeaux-oct-2026-only.ts (Médiathèque non modifiée)\n");
    const { execSync } = await import("node:child_process");
    execSync("npx tsx prisma/fix-gemeaux-oct-2026-only.ts", { stdio: "inherit", cwd: process.cwd() });
    return;
  }

  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) { console.error("Planning 2026-10 introuvable"); process.exit(1); }

  const allSites = await prisma.site.findMany();
  const siteByKey: Record<string, string> = {};
  for (const s of allSites) {
    if (s.name.includes("Gémeaux")) siteByKey.GEMEAUX = s.id;
    else if (s.name === "PLEYEL") siteByKey.PLEYEL = s.id;
    else if (s.name.includes("Horloge") || s.name.includes("Médiath")) siteByKey.MEDIATHEQUE = s.id;
    else if (s.name === "LE DOUZE") siteByKey["LE DOUZE"] = s.id;
    else if (s.name.includes("VISAGE")) siteByKey.VISAGE = s.id;
    else if (s.name === "ORDINAL") siteByKey.ORDINAL = s.id;
  }
  const { GEMEAUX: gemeauxId, PLEYEL: pleyelId, MEDIATHEQUE: medId } = siteByKey;
  if (!gemeauxId || !pleyelId || !medId) {
    console.error("Sites Gémeaux/Pleyel/Médiathèque introuvables", siteByKey);
    process.exit(1);
  }

  // 1. Agent profiles
  await syncAgentProfiles(siteByKey);

  // 2. Médiathèque: atomic reset + KIBRI assignments
  console.log("→ Réinitialisation Médiathèque...");
  const kibri = await prisma.agent.findFirst({ where: { lastName: "KIBRI" } });
  if (!kibri) { console.error("KIBRI introuvable"); process.exit(1); }
  await resetMediatheque(pm.id, medId, kibri.id);

  // 3. KIBRI Pleyel (sem. 1-2)
  await addKibriPleyel(pm.id, pleyelId, kibri.id);

  // 4a. Reset Gémeaux assignments for all managed agents (clean slate before rebuild)
  const managedAgents = await prisma.agent.findMany({
    where: {
      lastName: {
        in: ["DJEDIA", "DIAKITE", "DEMBELE", "SEITI", "HOUNGUES", "EVINA", "DORCE", "CHARGUI", "KIBRI", "LAJIMI"],
        mode: "insensitive",
      },
      active: true,
    },
  });
  const managedIds = managedAgents.map((a) => a.id);
  const resetCount = await prisma.assignment.deleteMany({
    where: { planningMonthId: pm.id, siteId: gemeauxId, agentId: { in: managedIds } },
  });
  if (resetCount.count > 0) console.log(`✓ Reset Gémeaux: ${resetCount.count} affectations supprimées (reconstruction propre)`);

  // 4b. Cleanup invalid assignments (DORCE Pleyel+Gémeaux same day, etc.)
  await cleanupOctober(pm.id, gemeauxId, pleyelId);

  // 5. Trim to caps
  await trimToCaps(pm.id);

  // 6. Top-up agents — KIBRI EN PREMIER pour réserver ses créneaux Gémeaux
  await topUpAgent(pm.id, gemeauxId, "DIAKITE", {
    maxH: 156, maxS: 13, nightOnly: true,
    fromDateRestrict: { from: "2026-10-19", days: FRI_SAT_SUN },
  });
  // KIBRI en priorité : les autres agents remplissent autour de lui
  await topUpKibriGemeaux(pm.id, gemeauxId, medId, kibri.id);

  await topUpAgent(pm.id, gemeauxId, "DJEDIA", {
    maxH: 156, maxS: 13, dayOnly: true, allowedDays: MON_TUE_SAT,
  });
  await topUpAgent(pm.id, gemeauxId, "DEMBELE", { maxH: 156, maxS: 13, dayOnly: true });
  await topUpAgent(pm.id, gemeauxId, "SEITI", { maxH: 156, maxS: 13, dayOnly: true });
  // EVINA avant HOUNGUES : priorité vendredis (SSIAP 2)
  await topUpAgent(pm.id, gemeauxId, "EVINA", {
    maxH: 80, maxS: 7, dayOnly: true,
    allowedDays: new Set([DayOfWeek.FRIDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.SATURDAY]),
  });
  await topUpAgent(pm.id, gemeauxId, "HOUNGUES", { maxH: 120, maxS: 10, dayOnly: true });
  await topUpAgent(pm.id, gemeauxId, "DORCE", {
    maxH: 156, maxS: 13, dayOnly: true, checkPleyel: pleyelId,
  });
  await topUpAgent(pm.id, gemeauxId, "CHARGUI", {
    maxH: 60, maxS: 5,
    allowedDays: new Set([DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]),
  });
  // LAJIMI: chef SSIAP 2, TEAM_LEADER slot, Mon–Thu–Sat journée
  await topUpAgent(pm.id, gemeauxId, "LAJIMI", {
    maxH: 156, maxS: 13, dayOnly: true,
    allowedDays: new Set([DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.SATURDAY]),
    role: PositionRole.TEAM_LEADER,
  });

  // 8. Summary
  await printSummary(pm.id);

  // 9. Validation (optional, slow)
  if (process.argv.includes("--validate")) {
    const stats = await validatePlanningMonth(pm.id);
    console.log(`\n✓ Validation: ${stats.errorCount} erreur(s), ${stats.warningCount} avertissement(s)`);
  } else {
    console.log("\nℹ Ajoutez --validate pour revalider les alertes.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
