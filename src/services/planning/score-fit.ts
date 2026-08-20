import type { Agent, AgentSiteRule, Assignment } from "@prisma/client";
import { getDayOfWeek, parseDateKey, toDateKey } from "@/lib/planning/dates";
import {
  countWeekendWeeksWorked,
  isWeekendDay,
  weekendWeeksWorkedBefore,
} from "@/lib/planning/weekends";
import { hoursBetweenShifts, sumAssignmentHours } from "@/lib/planning/hours";
import { scoreSiteFit } from "@/services/rules/eligibility";
import type { SuggestionReasonDetail } from "@/types/planning";
import { fr } from "@/lib/i18n/fr";

const MAX_CONSECUTIVE_WORK_DAYS = 4;
const MAX_WEEKENDS_PER_MONTH = 2;
const MIN_REST_HOURS = 11;

export type RankableAgent = Agent & { siteRules: AgentSiteRule[] };

export type RankableAssignment = Pick<
  Assignment,
  "id" | "agentId" | "siteId" | "date" | "startTime" | "endTime" | "hours" | "shiftType"
>;

export type FitScoreInput = {
  agent: RankableAgent;
  siteId: string;
  date: Date;
  startTime: string;
  endTime: string;
  shiftHours: number;
  monthAssignments: RankableAssignment[];
  siteHistoryCount: number;
  allTimeSiteCount?: number;
  teamAvgHours: number;
  warningCount: number;
};

export type RankingSignals = {
  siteFit: number;
  preferredDay: boolean | null;
  weekendWeeksUsed: number;
  consecutiveDaysIfAssigned: number;
  restHours: number | null;
  assignmentCount: number;
  workedHours: number;
  fairnessDeltaHours: number;
  contractUtilization: number | null;
};

export type FitScoreResult = {
  delta: number;
  reasons: SuggestionReasonDetail[];
  signals: RankingSignals;
};

function addDaysKey(dateKey: string, delta: number): string {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}

function consecutiveStreakIncluding(workDates: Iterable<string>, slotDate: string): number {
  const set = new Set(workDates);
  set.add(slotDate);
  let streak = 1;
  for (let i = 1; set.has(addDaysKey(slotDate, -i)); i++) streak++;
  for (let i = 1; set.has(addDaysKey(slotDate, i)); i++) streak++;
  return streak;
}

function nearestRestHours(
  assignments: RankableAssignment[],
  slot: { date: Date; startTime: string; endTime: string }
): number | null {
  if (assignments.length === 0) return null;

  let best: number | null = null;
  for (const a of assignments) {
    const hours = hoursBetweenShifts(
      { date: a.date, startTime: a.startTime, endTime: a.endTime },
      slot
    );
    if (best === null || Math.abs(hours) < Math.abs(best)) best = hours;
  }
  return best;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Soft ranking on top of hard eligibility. Higher delta = better affectation. */
export function scoreAssignmentFit(input: FitScoreInput): FitScoreResult {
  const reasons: SuggestionReasonDetail[] = [];
  let delta = 0;

  const agentAssignments = input.monthAssignments.filter((a) => a.agentId === input.agent.id);
  const workedHours = sumAssignmentHours(agentAssignments);
  const slotDateKey = toDateKey(input.date);
  const day = getDayOfWeek(input.date);
  const siteRule = input.agent.siteRules.find((r) => r.siteId === input.siteId && r.active !== false);

  const siteFit = scoreSiteFit(input.agent, input.siteId, input.date);
  delta += siteFit;

  if (siteRule?.fixedStartTime && siteRule.fixedStartTime === input.startTime) {
    delta += 8;
    reasons.push({ text: fr.planning.scheduleCompatible, type: "ok" });
  } else if (siteRule?.fixedStartTime) {
    delta -= 5;
  }

  const hourCap = siteRule?.maxHours ?? input.agent.contractHours;
  let contractUtilization: number | null = null;
  if (hourCap && hourCap > 0) {
    const projected = workedHours + input.shiftHours;
    contractUtilization = projected / hourCap;
    if (projected <= hourCap * 0.85) {
      delta += 5;
      reasons.push({ text: "Contrat OK", type: "ok" });
    } else if (projected <= hourCap) {
      delta -= 3;
      reasons.push({
        text: `${fr.planning.nearHourLimit} ${hourCap}h`,
        type: "warn",
      });
    }
  }

  if (input.siteHistoryCount >= 3) {
    delta += 5;
    reasons.push({ text: fr.planning.knowsSite, type: "ok" });
  } else if ((input.allTimeSiteCount ?? 0) >= 8) {
    delta += 3;
    reasons.push({ text: fr.planning.knowsSite, type: "ok" });
  }

  const preferred = input.agent.preferredDays;
  let preferredDay: boolean | null = null;
  if (preferred.length > 0) {
    preferredDay = preferred.includes(day);
    if (preferredDay) {
      delta += 10;
      reasons.push({ text: fr.planning.preferredDay, type: "ok" });
    } else {
      delta -= 6;
      reasons.push({ text: fr.planning.notPreferredDay, type: "warn" });
    }
  }

  const weekendWeeksBefore = weekendWeeksWorkedBefore(agentAssignments, input.date);
  const weekendWeeksAfter = isWeekendDay(input.date)
    ? countWeekendWeeksWorked(
        [
          ...agentAssignments,
          {
            date: input.date,
          },
        ],
        input.date
      )
    : weekendWeeksBefore;

  if (isWeekendDay(input.date)) {
    if (weekendWeeksAfter > MAX_WEEKENDS_PER_MONTH) {
      delta -= 14;
      reasons.push({ text: fr.planning.weekendLoaded, type: "warn" });
    } else if (weekendWeeksAfter === MAX_WEEKENDS_PER_MONTH) {
      delta -= 5;
      reasons.push({ text: fr.planning.weekendLoaded, type: "warn" });
    } else if (weekendWeeksBefore === 0) {
      delta += 2;
    }
  }

  const workDates = agentAssignments.map((a) => toDateKey(a.date));
  const consecutiveDaysIfAssigned = consecutiveStreakIncluding(workDates, slotDateKey);
  if (consecutiveDaysIfAssigned >= MAX_CONSECUTIVE_WORK_DAYS) {
    delta -= 10;
    reasons.push({ text: fr.planning.consecutiveLimit, type: "warn" });
  } else if (consecutiveDaysIfAssigned === MAX_CONSECUTIVE_WORK_DAYS - 1) {
    delta -= 4;
  }

  const restHours = nearestRestHours(agentAssignments, {
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
  });
  if (restHours !== null) {
    const absRest = Math.abs(restHours);
    if (absRest < MIN_REST_HOURS) {
      delta -= 18;
      reasons.push({ text: fr.planning.tightRest, type: "warn" });
    } else if (absRest < MIN_REST_HOURS + 1) {
      delta -= 6;
      reasons.push({ text: fr.planning.tightRest, type: "warn" });
    } else if (absRest >= 24) {
      delta += 2;
    }
  }

  const fairnessDeltaHours = input.teamAvgHours - workedHours;
  delta += clamp(fairnessDeltaHours * 0.35, -12, 12);
  if (fairnessDeltaHours >= 12) {
    reasons.push({ text: fr.planning.lighterWorkload, type: "ok" });
  } else if (fairnessDeltaHours <= -12) {
    reasons.push({ text: fr.planning.heavierWorkload, type: "warn" });
  }

  if (input.warningCount > 0) {
    delta -= input.warningCount * 6;
  }

  return {
    delta,
    reasons,
    signals: {
      siteFit,
      preferredDay,
      weekendWeeksUsed: weekendWeeksBefore,
      consecutiveDaysIfAssigned,
      restHours,
      assignmentCount: agentAssignments.length,
      workedHours,
      fairnessDeltaHours: Math.round(fairnessDeltaHours * 10) / 10,
      contractUtilization,
    },
  };
}

export function teamAverageHours(monthAssignments: RankableAssignment[], agentCount: number): number {
  if (agentCount <= 0) return 0;
  return sumAssignmentHours(monthAssignments) / agentCount;
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function blendEngineAndAiScore(engineScore: number, aiScore: number): number {
  return clampScore(engineScore * 0.7 + aiScore * 0.3);
}
