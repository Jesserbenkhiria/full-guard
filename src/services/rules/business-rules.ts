import type { ExtendedRuleContext } from "@/services/rules/context";
import type { PlanningRule } from "@/services/rules/engine";
import { ruleFail, rulePass } from "@/services/rules/rule-result";
import { sumAssignmentHours } from "@/lib/planning/hours";
import { isForbiddenDayNightTransition } from "@/services/rules/shift-classification";
import { isDateInRange, toDateKey, parseDateKey, getDayOfWeek } from "@/lib/planning/dates";
import { AGENT_CONSTRAINTS, getAgentDayShiftLimits, getAgentMaxConsecutiveWorkDays, getAgentMaxWeekendsPerMonth, getAgentMaxShiftsPerMonth, agentKeyFromAgent, agentAllowsConsecutiveShifts } from "@/data/agent-constraints";
import {
  countWeekendWeeksWorked,
  isWeekendDay,
} from "@/lib/planning/weekends";

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

export const consecutiveWorkDaysRule: PlanningRule = {
  code: "MAX_CONSECUTIVE_WORK_DAYS",
  name: "Jours travaillés consécutifs",
  check(ctx: ExtendedRuleContext) {
    const key = agentKeyFromAgent(ctx.agent);
    const hardCap =
      AGENT_CONSTRAINTS.find((c) => c.agentKey === key)?.maxConsecutiveWorkDays !=
      null;
    if (agentAllowsConsecutiveShifts(key) && !hardCap) {
      return rulePass();
    }

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

    const maxAllowed = getAgentMaxConsecutiveWorkDays(agentKeyFromAgent(ctx.agent));

    if (longest > maxAllowed) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — maximum de jours travaillés consécutifs dépassé (${longest} > ${maxAllowed})`,
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
    if (agentAllowsConsecutiveShifts(agentKeyFromAgent(ctx.agent))) {
      return rulePass();
    }

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

export const weekendLimitRule: PlanningRule = {
  code: "MAX_WEEKENDS",
  name: "Maximum week-ends",
  check(ctx: ExtendedRuleContext) {
    if (!isWeekendDay(ctx.date)) {
      return rulePass();
    }

    const max = getAgentMaxWeekendsPerMonth(agentKeyFromAgent(ctx.agent));
    if (max == null) return rulePass();

    const weekendWeeks = countWeekendWeeksWorked(ctx.monthAssignments, ctx.date);

    if (weekendWeeks > max) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — maximum de ${max} week-ends travaillés par mois dépassé (${weekendWeeks}/${max})`,
        "MAX_WEEKENDS"
      );
    }
    return rulePass();
  },
};

export const maxShiftsPerMonthRule: PlanningRule = {
  code: "MAX_SHIFTS_PER_MONTH",
  name: "Maximum de vacations par mois",
  check(ctx: ExtendedRuleContext) {
    const max = getAgentMaxShiftsPerMonth(agentKeyFromAgent(ctx.agent));
    if (max == null) return rulePass();
    const count = ctx.monthAssignments.length;
    if (count > max) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — maximum de ${max} vacations par mois dépassé (${count}/${max})`,
        "MAX_SHIFTS_PER_MONTH"
      );
    }
    return rulePass();
  },
};

export const maxShiftsOnDayRule: PlanningRule = {
  code: "MAX_SHIFTS_ON_DAY",
  name: "Maximum de vacations par jour",
  check(ctx: ExtendedRuleContext) {
    const agentKey = ctx.agent.firstName.trim()
      ? `${ctx.agent.firstName.trim()}_${ctx.agent.lastName}`
      : ctx.agent.lastName;
    const dayLimits = getAgentDayShiftLimits(agentKey);
    if (!dayLimits) return rulePass();

    const day = getDayOfWeek(ctx.date);
    const max = dayLimits[day];
    if (max == null) return rulePass();

    const count = ctx.monthAssignments.filter(
      (a) => a.id !== ctx.assignmentId && getDayOfWeek(a.date) === day
    ).length;

    if (count >= max) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — maximum ${max} vacation(s) le ${day.toLowerCase()} par mois`,
        "MAX_SHIFTS_ON_DAY"
      );
    }
    return rulePass();
  },
};

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
