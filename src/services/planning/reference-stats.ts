import type { Assignment, DayOfWeek, ShiftType } from "@prisma/client";
import { getDayOfWeek, toDateKey } from "@/lib/planning/dates";
import { calculateShiftHours } from "@/lib/planning/hours";

export type ReferenceAssignment = Pick<
  Assignment,
  "agentId" | "siteId" | "date" | "startTime" | "endTime" | "shiftType" | "hours"
>;

export type AgentReferenceProfile = {
  agentId: string;
  totalHours: number;
  totalShifts: number;
  /** siteId → shift count */
  siteCounts: Record<string, number>;
  /** siteId → hours */
  siteHours: Record<string, number>;
  shiftTypeCounts: Partial<Record<ShiftType, number>>;
  dayOfWeekCounts: Partial<Record<DayOfWeek, number>>;
  /** siteId → dayOfWeek → count */
  siteDayCounts: Record<string, Partial<Record<DayOfWeek, number>>>;
  /** siteId → "start-end" → count */
  siteTimePatterns: Record<string, Record<string, number>>;
};

export type ReferenceStatsBundle = {
  planningMonthId: string;
  year: number;
  month: number;
  profiles: Map<string, AgentReferenceProfile>;
};

function timePatternKey(startTime: string, endTime: string): string {
  return `${startTime}-${endTime}`;
}

function shiftHours(a: ReferenceAssignment): number {
  return a.hours ?? calculateShiftHours(a.startTime, a.endTime);
}

/** Build per-agent reference profiles from a reference planning month. */
export function buildReferenceStats(
  planningMonthId: string,
  year: number,
  month: number,
  assignments: ReferenceAssignment[]
): ReferenceStatsBundle {
  const profiles = new Map<string, AgentReferenceProfile>();

  for (const a of assignments) {
    let profile = profiles.get(a.agentId);
    if (!profile) {
      profile = {
        agentId: a.agentId,
        totalHours: 0,
        totalShifts: 0,
        siteCounts: {},
        siteHours: {},
        shiftTypeCounts: {},
        dayOfWeekCounts: {},
        siteDayCounts: {},
        siteTimePatterns: {},
      };
      profiles.set(a.agentId, profile);
    }

    const hours = shiftHours(a);
    const day = getDayOfWeek(a.date);
    const pattern = timePatternKey(a.startTime, a.endTime);

    profile.totalHours = Math.round((profile.totalHours + hours) * 10) / 10;
    profile.totalShifts += 1;
    profile.siteCounts[a.siteId] = (profile.siteCounts[a.siteId] ?? 0) + 1;
    profile.siteHours[a.siteId] = Math.round(((profile.siteHours[a.siteId] ?? 0) + hours) * 10) / 10;
    profile.shiftTypeCounts[a.shiftType] = (profile.shiftTypeCounts[a.shiftType] ?? 0) + 1;
    profile.dayOfWeekCounts[day] = (profile.dayOfWeekCounts[day] ?? 0) + 1;

    if (!profile.siteDayCounts[a.siteId]) profile.siteDayCounts[a.siteId] = {};
    profile.siteDayCounts[a.siteId][day] = (profile.siteDayCounts[a.siteId][day] ?? 0) + 1;

    if (!profile.siteTimePatterns[a.siteId]) profile.siteTimePatterns[a.siteId] = {};
    profile.siteTimePatterns[a.siteId][pattern] =
      (profile.siteTimePatterns[a.siteId][pattern] ?? 0) + 1;
  }

  return { planningMonthId, year, month, profiles };
}

/** Load the designated reference month (isReference=true) for auto-fill weighting. */
export async function loadReferenceStatsFromDb(
  prismaClient: {
    planningMonth: {
      findFirst: (args: object) => Promise<{ id: string; year: number; month: number } | null>;
    };
    assignment: {
      findMany: (args: object) => Promise<ReferenceAssignment[]>;
    };
  }
): Promise<ReferenceStatsBundle | null> {
  const refMonth = await prismaClient.planningMonth.findFirst({
    where: { isReference: true },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  if (!refMonth) return null;

  const assignments = await prismaClient.assignment.findMany({
    where: { planningMonthId: refMonth.id },
    select: {
      agentId: true,
      siteId: true,
      date: true,
      startTime: true,
      endTime: true,
      shiftType: true,
      hours: true,
    },
  });

  return buildReferenceStats(refMonth.id, refMonth.year, refMonth.month, assignments);
}

export type ReferenceFitInput = {
  agentId: string;
  siteId: string;
  date: Date;
  startTime: string;
  endTime: string;
  shiftType?: ShiftType;
};

export type ReferenceFitResult = {
  delta: number;
  siteShiftCount: number;
  siteHours: number;
  matchingTimePattern: boolean;
  typicalDayAtSite: boolean;
};

/**
 * Soft boost when agent mirrored this site/shift/day in the reference month.
 * Only applies among legally eligible agents — call after hard rules pass.
 */
export function scoreReferenceFit(
  bundle: ReferenceStatsBundle | null | undefined,
  input: ReferenceFitInput
): ReferenceFitResult {
  const empty: ReferenceFitResult = {
    delta: 0,
    siteShiftCount: 0,
    siteHours: 0,
    matchingTimePattern: false,
    typicalDayAtSite: false,
  };
  if (!bundle) return empty;

  const profile = bundle.profiles.get(input.agentId);
  if (!profile) return empty;

  let delta = 0;
  const siteShiftCount = profile.siteCounts[input.siteId] ?? 0;
  const siteHours = profile.siteHours[input.siteId] ?? 0;
  const pattern = timePatternKey(input.startTime, input.endTime);
  const patternCount = profile.siteTimePatterns[input.siteId]?.[pattern] ?? 0;
  const day = getDayOfWeek(input.date);
  const siteDayCount = profile.siteDayCounts[input.siteId]?.[day] ?? 0;
  const siteTotal = siteShiftCount || 1;
  const typicalDayAtSite = siteDayCount >= 2 && siteDayCount / siteTotal >= 0.25;

  if (siteShiftCount >= 8) delta += 10;
  else if (siteShiftCount >= 4) delta += 7;
  else if (siteShiftCount >= 2) delta += 4;

  if (patternCount >= 3) {
    delta += 12;
  } else if (patternCount >= 1) {
    delta += 6;
  }

  if (typicalDayAtSite) delta += 5;

  if (input.shiftType && profile.shiftTypeCounts[input.shiftType]) {
    const typeShare =
      (profile.shiftTypeCounts[input.shiftType] ?? 0) / Math.max(profile.totalShifts, 1);
    if (typeShare >= 0.5) delta += 3;
  }

  return {
    delta,
    siteShiftCount,
    siteHours,
    matchingTimePattern: patternCount >= 1,
    typicalDayAtSite,
  };
}

/** Human-readable summary for import logs / admin. */
export function formatReferenceProfileSummary(
  profile: AgentReferenceProfile,
  siteNames: Map<string, string>
): string {
  const topSites = Object.entries(profile.siteCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, n]) => `${siteNames.get(id) ?? id} (${n})`)
    .join(", ");

  const topDays = Object.entries(profile.dayOfWeekCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d, n]) => `${d} (${n})`)
    .join(", ");

  return `${profile.totalShifts} shifts, ${profile.totalHours}h — sites: ${topSites || "—"} — days: ${topDays || "—"}`;
}
