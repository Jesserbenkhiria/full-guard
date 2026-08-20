import type { ExtendedRuleContext } from "@/services/rules/context";
import type { PlanningRule } from "@/services/rules/engine";
import { ruleFail, rulePass, getValidationResults } from "@/services/rules/rule-result";
import { isDateInRange } from "@/lib/planning/dates";
import { calculateShiftHours, shiftsOverlap } from "@/lib/planning/hours";
import { evaluateAgentSiteRules, evaluateSiteAuthorization } from "@/lib/site-authorization";
import { POSITION_ROLE_LABELS, resolveIsTeamLeader } from "@/lib/constants";

export { getValidationResults };

export const nightForbiddenRule: PlanningRule = {
  code: "NIGHT_FORBIDDEN",
  name: "Travail de nuit interdit",
  check(ctx: ExtendedRuleContext) {
    const isNight =
      ctx.shiftType === "NIGHT" ||
      (ctx.startTime >= "18:00" && ctx.endTime <= "08:00") ||
      ctx.endTime < ctx.startTime;

    if ((ctx.agent.nightForbidden || ctx.agent.dayOnly) && isNight) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — agent journée uniquement, affectation de nuit interdite`
      );
    }
    return rulePass();
  },
};

export const dayOnlyRestrictionRule: PlanningRule = {
  code: "DAY_ONLY_RESTRICTION",
  name: "Restriction jour uniquement",
  check(ctx: ExtendedRuleContext) {
    if (ctx.agent.dayOnly && ctx.shiftType === "NIGHT") {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — agent journée uniquement, affectation de nuit interdite`
      );
    }
    if (ctx.agent.dayOnly && ctx.endTime < ctx.startTime) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — agent journée uniquement, affectation de nuit interdite`
      );
    }
    return rulePass();
  },
};

export const vacationConflictRule: PlanningRule = {
  code: "VACATION_CONFLICT",
  name: "Conflit de congés",
  check(ctx: ExtendedRuleContext) {
    for (const vacation of ctx.vacations) {
      if (isDateInRange(ctx.date, vacation.startDate, vacation.endDate)) {
        return ruleFail(
          "ERROR",
          `${ctx.agentName} — agent indisponible pendant cette période`
        );
      }
    }
    return rulePass();
  },
};

export const medicalConflictRule: PlanningRule = {
  code: "MEDICAL_CONFLICT",
  name: "Conflit visite médicale",
  check(ctx: ExtendedRuleContext) {
    const dateKey = ctx.date.toISOString().slice(0, 10);
    for (const visit of ctx.medicalVisits) {
      if (visit.date.toISOString().slice(0, 10) === dateKey) {
        return ruleFail(
          "ERROR",
          `${ctx.agentName} — agent indisponible pendant cette période (visite médicale)`
        );
      }
    }
    return rulePass();
  },
};

export const unavailableDateRule: PlanningRule = {
  code: "UNAVAILABLE_DATE",
  name: "Date indisponible",
  check(ctx: ExtendedRuleContext) {
    const dateKey = ctx.date.toISOString().slice(0, 10);
    for (const unavailable of ctx.unavailableDates) {
      if (unavailable.toISOString().slice(0, 10) === dateKey) {
        return ruleFail(
          "ERROR",
          `${ctx.agentName} — agent indisponible pendant cette période`
        );
      }
    }
    return rulePass();
  },
};

export const doubleAssignmentRule: PlanningRule = {
  code: "DOUBLE_ASSIGNMENT",
  name: "Double affectation",
  check(ctx: ExtendedRuleContext) {
    if (ctx.sameDayAssignments.length > 0) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — déjà affecté sur cette période`
      );
    }
    return rulePass();
  },
};

export const overlappingShiftRule: PlanningRule = {
  code: "OVERLAPPING_SHIFT",
  name: "Chevauchement de postes",
  check(ctx: ExtendedRuleContext) {
    for (const other of ctx.sameDayAssignments) {
      if (shiftsOverlap(ctx.startTime, ctx.endTime, other.startTime, other.endTime)) {
        return ruleFail(
          "ERROR",
          `${ctx.agentName} — déjà affecté sur cette période`
        );
      }
    }
    return rulePass();
  },
};

function siteCheck(ctx: ExtendedRuleContext) {
  return {
    siteId: ctx.siteId!,
    date: ctx.date,
    startTime: ctx.startTime,
    endTime: ctx.endTime,
  };
}

function profileResults(ctx: ExtendedRuleContext) {
  if (!ctx.siteId) return [];
  return evaluateAgentSiteRules(ctx.siteRules, siteCheck(ctx), ctx.agentName);
}

export const siteAuthorizationRule: PlanningRule = {
  code: "SITE_NOT_AUTHORIZED",
  name: "Site non autorisé",
  check(ctx: ExtendedRuleContext) {
    if (!ctx.siteId) return rulePass();

    const profile = profileResults(ctx);
    const blocked = profile.find(
      (r) => !r.authorized && r.ruleCode === "SITE_NOT_AUTHORIZED"
    );
    if (blocked?.message) {
      return ruleFail("ERROR", `${ctx.agentName} — agent non autorisé pour ce site`);
    }

    if (profile.length === 0) {
      const legacy = evaluateSiteAuthorization(
        {
          siteRestrictionType: ctx.agent.siteRestrictionType,
          allowedSiteIds: ctx.agent.allowedSiteIds,
        },
        ctx.siteId,
        ctx.agentName
      );
      if (!legacy.authorized) {
        return ruleFail("ERROR", `${ctx.agentName} — agent non autorisé pour ce site`);
      }
    }

    return rulePass();
  },
};

export const siteDayNotAllowedRule: PlanningRule = {
  code: "SITE_DAY_NOT_ALLOWED",
  name: "Jour non autorisé sur le site",
  check(ctx: ExtendedRuleContext) {
    const hit = profileResults(ctx).find((r) => r.ruleCode === "SITE_DAY_NOT_ALLOWED");
    if (hit?.message) return ruleFail("ERROR", hit.message);
    return rulePass();
  },
};

export const fixedStartTimeRule: PlanningRule = {
  code: "FIXED_START_TIME_MISMATCH",
  name: "Heure de début non conforme",
  check(ctx: ExtendedRuleContext) {
    const hit = profileResults(ctx).find((r) => r.ruleCode === "FIXED_START_TIME_MISMATCH");
    if (hit?.message) {
      return ruleFail(hit.severity === "error" ? "ERROR" : "WARNING", hit.message);
    }
    return rulePass();
  },
};

export const fixedEndTimeRule: PlanningRule = {
  code: "FIXED_END_TIME_MISMATCH",
  name: "Heure de fin non conforme",
  check(ctx: ExtendedRuleContext) {
    const hit = profileResults(ctx).find((r) => r.ruleCode === "FIXED_END_TIME_MISMATCH");
    if (hit?.message) {
      return ruleFail(hit.severity === "error" ? "ERROR" : "WARNING", hit.message);
    }
    return rulePass();
  },
};

export const sitePreferredWarningRule: PlanningRule = {
  code: "SITE_PREFERRED_WARNING",
  name: "Site hors périmètre préféré",
  check(ctx: ExtendedRuleContext) {
    if (!ctx.siteId) return rulePass();

    const hit = profileResults(ctx).find((r) => r.ruleCode === "SITE_PREFERRED_WARNING");
    if (hit?.message) return ruleFail("WARNING", hit.message);

    if (profileResults(ctx).length === 0 && ctx.agent.siteRestrictionType === "PREFERRED") {
      const legacy = evaluateSiteAuthorization(
        {
          siteRestrictionType: ctx.agent.siteRestrictionType,
          allowedSiteIds: ctx.agent.allowedSiteIds,
        },
        ctx.siteId,
        ctx.agentName
      );
      if (legacy.severity === "warning" && legacy.message) {
        return ruleFail("WARNING", legacy.message);
      }
    }

    return rulePass();
  },
};

export const planningValidatedRule: PlanningRule = {
  code: "PLANNING_VALIDATED",
  name: "Planning validé",
  check() {
    return {
      valid: true,
      severity: "INFO" as const,
      ruleCode: "PLANNING_VALIDATED",
      message: "Affectation conforme aux règles métier",
    };
  },
};

export const positionRoleRule: PlanningRule = {
  code: "POSITION_ROLE_MISMATCH",
  name: "Poste / rôle incompatible",
  check(ctx: ExtendedRuleContext) {
    if (ctx.role === "TEAM_LEADER" && !resolveIsTeamLeader(ctx.agent)) {
      return ruleFail(
        "ERROR",
        `${ctx.agentName} — poste ${POSITION_ROLE_LABELS.TEAM_LEADER} réservé aux chefs d'équipe`
      );
    }
    return rulePass();
  },
};

export function calculateShiftHoursForContext(ctx: ExtendedRuleContext): number {
  return calculateShiftHours(ctx.startTime, ctx.endTime);
}
