import type { ExtendedRuleContext } from "@/services/rules/context";
import type { PlanningRule } from "@/services/rules/engine";
import { ruleFail, rulePass } from "@/services/rules/rule-result";
import { sumAssignmentHours } from "@/lib/planning/hours";
import { isForbiddenDayNightTransition } from "@/services/rules/shift-classification";
import { isDateInRange, toDateKey, parseDateKey, getDayOfWeek } from "@/lib/planning/dates";

function countVacationPeriodsInMonth(
  vacations: { startDate: Date; endDate: Date }[],
  year: number,
  month: number
): number {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  return vacations.filter(
    (v) => v.startDate <= monthEnd && v.endDate >= monthStart
  ).length;
}

export const absenceConflictRule: PlanningRule = {
  code: "ABSENCE_CONFLICT",
  name: "Conflit absence",
  check(ctx: ExtendedRuleContext) {
    for (const absence of ctx.absences) {
      if (isDateInRange(ctx.date, absence.startDate, absence.endDate)) {
        return ruleFail(
          "ERROR",
          `${ctx.agentName} — agent indisponible pendant cette période`,
          "ABSENCE_CONFLICT"
        );
      }
    }
    return rulePass();
  },
};

export const contractHoursRule: PlanningRule = {
  code: "CONTRACT_HOURS_EXCEEDED",
  name: "Heures contractuelles",
  check(ctx: ExtendedRuleContext) {
    if (!ctx.agent.contractHours) return rulePass();

    const workedHours = sumAssignmentHours(ctx.monthAssignments);
    if (workedHours <= ctx.agent.contractHours) return rulePass();

    if (!ctx.agent.overtimeAllowed) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — dépassement des heures contractuelles maximales (${workedHours}h / ${ctx.agent.contractHours}h)`,
        "OVERTIME_NOT_ALLOWED"
      );
    }

    return ruleFail(
      "WARNING",
      `${ctx.agentName} — dépasse les heures contractuelles mais les heures sup. sont autorisées (${workedHours}h / ${ctx.agent.contractHours}h)`,
      "OVERTIME_WARNING"
    );
  },
};

export const siteMaxHoursRule: PlanningRule = {
  code: "SITE_MAX_HOURS",
  name: "Maximum heures site",
  check(ctx: ExtendedRuleContext) {
    if (!ctx.siteId) return rulePass();

    const siteRule = ctx.siteRules.find((r) => r.siteId === ctx.siteId);
    if (!siteRule?.maxHours) return rulePass();

    const siteHours = sumAssignmentHours(
      ctx.monthAssignments.filter((a) => a.siteId === ctx.siteId)
    );

    if (siteHours > siteRule.maxHours) {
      if (!ctx.agent.overtimeAllowed) {
        return ruleFail(
          "ERROR",
          `${ctx.agentName} — maximum ${siteRule.maxHours}h sur ce site dépassé (${siteHours}h)`,
          "SITE_MAX_HOURS"
        );
      }
      return ruleFail(
        "WARNING",
        `${ctx.agentName} — ${siteHours}h sur ce site (max ${siteRule.maxHours}h)`,
        "SITE_MAX_HOURS"
      );
    }
    return rulePass();
  },
};

export const maxVacationsRule: PlanningRule = {
  code: "MAX_VACATIONS",
  name: "Maximum de congés",
  check(ctx: ExtendedRuleContext) {
    const max = ctx.agent.maxVacationsPerMonth;
    if (max == null) return rulePass();

    const year = ctx.date.getFullYear();
    const month = ctx.date.getMonth() + 1;
    const count = countVacationPeriodsInMonth(ctx.vacations, year, month);

    if (count > max) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — maximum ${max} congés par mois dépassé`,
        "MAX_VACATIONS"
      );
    }
    return rulePass();
  },
};

const MAX_CONSECUTIVE_WORK_DAYS = 4;

export const consecutiveWorkDaysRule: PlanningRule = {
  code: "MAX_CONSECUTIVE_WORK_DAYS",
  name: "Jours travaillés consécutifs",
  check(ctx: ExtendedRuleContext) {
    const workDates = new Set(
      ctx.monthAssignments.map((a) => toDateKey(a.date))
    );
    if (workDates.size === 0) return rulePass();

    const sorted = [...workDates].sort();
    let longest = 1;
    let current = 1;

    for (let i = 1; i < sorted.length; i++) {
      const prev = parseDateKey(sorted[i - 1]);
      const curr = parseDateKey(sorted[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diffDays === 1) {
        current++;
        longest = Math.max(longest, current);
      } else {
        current = 1;
      }
    }

    if (longest > MAX_CONSECUTIVE_WORK_DAYS) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — maximum de jours travaillés consécutifs dépassé (${longest} > ${MAX_CONSECUTIVE_WORK_DAYS})`,
        "MAX_CONSECUTIVE_WORK_DAYS"
      );
    }
    return rulePass();
  },
};

export const dayNightTransitionRule: PlanningRule = {
  code: "DAY_NIGHT_TRANSITION",
  name: "Transition jour/nuit",
  check(ctx: ExtendedRuleContext) {
    const current = {
      shiftType: ctx.shiftType,
      startTime: ctx.startTime,
      endTime: ctx.endTime,
    };

    const others = ctx.monthAssignments.filter((a) => a.id !== ctx.assignmentId);

    for (const other of others) {
      const otherShift = {
        shiftType: other.shiftType,
        startTime: other.startTime,
        endTime: other.endTime,
      };

      const sameDay = toDateKey(other.date) === toDateKey(ctx.date);
      const prevDay =
        toDateKey(other.date) ===
        toDateKey(new Date(ctx.date.getTime() - 86400000));
      const nextDay =
        toDateKey(other.date) ===
        toDateKey(new Date(ctx.date.getTime() + 86400000));

      if (
        sameDay ||
        (prevDay && isForbiddenDayNightTransition(otherShift, current)) ||
        (nextDay && isForbiddenDayNightTransition(current, otherShift))
      ) {
        if (isForbiddenDayNightTransition(current, otherShift)) {
          return ruleFail(
            "ERROR",
            `${ctx.agentName} — transition jour/nuit invalide`,
            "DAY_NIGHT_TRANSITION"
          );
        }
      }
    }
    return rulePass();
  },
};

const MAX_WEEKENDS_PER_MONTH = 2;

export const weekendLimitRule: PlanningRule = {
  code: "MAX_WEEKENDS",
  name: "Maximum week-ends",
  check(ctx: ExtendedRuleContext) {
    const weekendWeeks = new Set<string>();

    for (const a of ctx.monthAssignments) {
      const dow = getDayOfWeek(a.date);
      if (dow !== "SATURDAY" && dow !== "SUNDAY") continue;
      const weekKey = `${a.date.getFullYear()}-W${getWeekNumber(a.date)}`;
      weekendWeeks.add(weekKey);
    }

    if (weekendWeeks.size > MAX_WEEKENDS_PER_MONTH) {
      return ruleFail(
        "WARNING",
        `${ctx.agentName} — maximum de week-ends travaillés par mois dépassé (${weekendWeeks.size}/${MAX_WEEKENDS_PER_MONTH})`,
        "MAX_WEEKENDS"
      );
    }
    return rulePass();
  },
};

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export const canWorkNightRule: PlanningRule = {
  code: "CANNOT_WORK_NIGHT",
  name: "Nuit non autorisée (profil)",
  check(ctx: ExtendedRuleContext) {
    const isNight =
      ctx.shiftType === "NIGHT" || ctx.endTime < ctx.startTime;

    if (isNight && !ctx.agent.canWorkNight && !ctx.agent.dayOnly && !ctx.agent.nightForbidden) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — ne peut pas travailler de nuit`,
        "CANNOT_WORK_NIGHT"
      );
    }
    return rulePass();
  },
};
