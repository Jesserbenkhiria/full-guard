import type { PlanningRule } from "@/services/rules/engine";
import {
  nightForbiddenRule,
  dayOnlyRestrictionRule,
  positionRoleRule,
  siteAuthorizationRule,
  siteDayNotAllowedRule,
  fixedStartTimeRule,
  fixedEndTimeRule,
  sitePreferredWarningRule,
  vacationConflictRule,
  medicalConflictRule,
  unavailableDateRule,
  doubleAssignmentRule,
  overlappingShiftRule,
  planningValidatedRule,
} from "@/services/rules/builtin-rules";
import {
  absenceConflictRule,
  contractHoursRule,
  siteMaxHoursRule,
  maxVacationsRule,
  consecutiveWorkDaysRule,
  dayNightTransitionRule,
  weekendLimitRule,
  canWorkNightRule,
  maxShiftsOnDayRule,
  maxShiftsPerMonthRule,
} from "@/services/rules/business-rules";
import { siteCoverageRule } from "@/services/rules/planning-rules";

/** Code → implementation. DB `Rule` rows enable/disable which codes run. */
export const RULE_REGISTRY: Record<string, PlanningRule> = {
  NIGHT_FORBIDDEN: nightForbiddenRule,
  DAY_ONLY_RESTRICTION: dayOnlyRestrictionRule,
  CANNOT_WORK_NIGHT: canWorkNightRule,
  POSITION_ROLE_MISMATCH: positionRoleRule,
  SITE_NOT_AUTHORIZED: siteAuthorizationRule,
  SITE_DAY_NOT_ALLOWED: siteDayNotAllowedRule,
  FIXED_START_TIME_MISMATCH: fixedStartTimeRule,
  FIXED_END_TIME_MISMATCH: fixedEndTimeRule,
  SITE_PREFERRED_WARNING: sitePreferredWarningRule,
  SITE_MAX_HOURS: siteMaxHoursRule,
  VACATION_CONFLICT: vacationConflictRule,
  ABSENCE_CONFLICT: absenceConflictRule,
  MEDICAL_CONFLICT: medicalConflictRule,
  UNAVAILABLE_DATE: unavailableDateRule,
  DOUBLE_ASSIGNMENT: doubleAssignmentRule,
  OVERLAPPING_SHIFT: overlappingShiftRule,
  CONTRACT_HOURS_EXCEEDED: contractHoursRule,
  OVERTIME_NOT_ALLOWED: contractHoursRule,
  OVERTIME_WARNING: contractHoursRule,
  MAX_VACATIONS: maxVacationsRule,
  MAX_CONSECUTIVE_WORK_DAYS: consecutiveWorkDaysRule,
  DAY_NIGHT_TRANSITION: dayNightTransitionRule,
  MAX_WEEKENDS: weekendLimitRule,
  MAX_SHIFTS_ON_DAY: maxShiftsOnDayRule,
  MAX_SHIFTS_PER_MONTH: maxShiftsPerMonthRule,
  SITE_COVERAGE_MISSING: siteCoverageRule,
  PLANNING_VALIDATED: planningValidatedRule,
};

/** Default assignment-level rules (excludes planning-level coverage). */
export const ASSIGNMENT_RULE_CODES = [
  "CONTRACT_HOURS_EXCEEDED",
  "VACATION_CONFLICT",
  "ABSENCE_CONFLICT",
  "MEDICAL_CONFLICT",
  "UNAVAILABLE_DATE",
  "SITE_NOT_AUTHORIZED",
  "SITE_DAY_NOT_ALLOWED",
  "SITE_MAX_HOURS",
  "NIGHT_FORBIDDEN",
  "DAY_ONLY_RESTRICTION",
  "CANNOT_WORK_NIGHT",
  "MAX_VACATIONS",
  "MAX_CONSECUTIVE_WORK_DAYS",
  "DAY_NIGHT_TRANSITION",
  "MAX_WEEKENDS",
  "MAX_SHIFTS_ON_DAY",
  "MAX_SHIFTS_PER_MONTH",
  "DOUBLE_ASSIGNMENT",
  "OVERLAPPING_SHIFT",
  "FIXED_START_TIME_MISMATCH",
  "FIXED_END_TIME_MISMATCH",
  "SITE_PREFERRED_WARNING",
] as const;

export const ALL_IMPLEMENTED_RULES: PlanningRule[] = Object.values(
  Object.fromEntries(
    [...ASSIGNMENT_RULE_CODES, "SITE_COVERAGE_MISSING", "PLANNING_VALIDATED"].map((code) => [
      code,
      RULE_REGISTRY[code],
    ])
  )
).filter(Boolean);
