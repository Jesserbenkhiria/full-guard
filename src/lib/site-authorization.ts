import type { AgentSiteRuleType, DayOfWeek, SiteRestrictionType } from "@prisma/client";
import { getDayOfWeek } from "@/lib/planning/dates";
import { formatDays } from "@/lib/constants";

export type AgentSiteRuleInput = {
  siteId: string;
  ruleType: AgentSiteRuleType;
  allowedDays: DayOfWeek[];
  fixedStartTime?: string | null;
  fixedEndTime?: string | null;
  maxHours?: number | null;
  active?: boolean;
};

export type SiteAuthorization = {
  siteRestrictionType: SiteRestrictionType;
  allowedSiteIds: string[];
};

export type SiteAuthorizationEvaluation = {
  authorized: boolean;
  preferred: boolean;
  severity: "error" | "warning" | null;
  message: string | null;
  ruleCode?: string;
};

export type SiteAssignmentCheck = {
  siteId: string;
  date: Date;
  startTime: string;
  endTime: string;
};

/** Legacy agent-level check (fallback when no AgentSiteRule rows exist). */
export function evaluateSiteAuthorization(
  auth: SiteAuthorization,
  siteId: string,
  agentName?: string
): SiteAuthorizationEvaluation {
  const prefix = agentName ? `${agentName} — ` : "";

  if (auth.siteRestrictionType === "ANY") {
    return { authorized: true, preferred: true, severity: null, message: null };
  }

  const onList = auth.allowedSiteIds.includes(siteId);

  if (auth.siteRestrictionType === "ONLY") {
    if (!onList) {
      return {
        authorized: false,
        preferred: false,
        severity: "error",
        message: `${prefix}site non autorisé (affectation exclusive)`,
        ruleCode: "SITE_NOT_AUTHORIZED",
      };
    }
    return { authorized: true, preferred: true, severity: null, message: null };
  }

  if (onList) {
    return { authorized: true, preferred: true, severity: null, message: null };
  }

  return {
    authorized: true,
    preferred: false,
    severity: "warning",
    message: `${prefix}site hors périmètre préféré`,
    ruleCode: "SITE_PREFERRED_WARNING",
  };
}

function prefixName(agentName: string | undefined, message: string): string {
  return agentName ? `${agentName} — ${message}` : message;
}

/** Primary authorization using AgentSiteRule profiles. */
export function evaluateAgentSiteRules(
  rules: AgentSiteRuleInput[],
  check: SiteAssignmentCheck,
  agentName?: string
): SiteAuthorizationEvaluation[] {
  const active = rules.filter((r) => r.active !== false);
  const results: SiteAuthorizationEvaluation[] = [];

  if (active.length === 0) {
    return results;
  }

  const siteRule = active.find((r) => r.siteId === check.siteId);
  const onlyRules = active.filter((r) => r.ruleType === "ONLY");
  const preferredRules = active.filter((r) => r.ruleType === "PREFERRED");
  const onlySiteIds = onlyRules.map((r) => r.siteId);
  const preferredSiteIds = preferredRules.map((r) => r.siteId);

  if (siteRule?.ruleType === "BLOCKED") {
    results.push({
      authorized: false,
      preferred: false,
      severity: "error",
      message: prefixName(agentName, "site bloqué pour cet agent"),
      ruleCode: "SITE_NOT_AUTHORIZED",
    });
    return results;
  }

  const onOnlySite = onlySiteIds.includes(check.siteId);
  const onPreferredSite = preferredSiteIds.includes(check.siteId);

  if (onlySiteIds.length > 0 && !onOnlySite && !onPreferredSite) {
    results.push({
      authorized: false,
      preferred: false,
      severity: "error",
      message: prefixName(agentName, "site non autorisé (affectation exclusive)"),
      ruleCode: "SITE_NOT_AUTHORIZED",
    });
    return results;
  }

  if (
    preferredSiteIds.length > 0 &&
    onlySiteIds.length === 0 &&
    !onPreferredSite
  ) {
    results.push({
      authorized: true,
      preferred: false,
      severity: "warning",
      message: prefixName(agentName, "site hors périmètre préféré"),
      ruleCode: "SITE_PREFERRED_WARNING",
    });
  }

  const applicableRule = siteRule ?? (onOnlySite ? onlyRules.find((r) => r.siteId === check.siteId) : undefined);

  if (applicableRule) {
    if (applicableRule.allowedDays.length > 0) {
      const day = getDayOfWeek(check.date);
      if (!applicableRule.allowedDays.includes(day)) {
        results.push({
          authorized: false,
          preferred: false,
          severity: "error",
          message: prefixName(
            agentName,
            `ne peut travailler que ${formatDays(applicableRule.allowedDays)} sur ce site`
          ),
          ruleCode: "SITE_DAY_NOT_ALLOWED",
        });
      }
    }

    if (
      applicableRule.fixedStartTime &&
      applicableRule.fixedStartTime !== check.startTime
    ) {
      const hardBlock = applicableRule.ruleType === "ONLY";
      results.push({
        authorized: !hardBlock,
        preferred: applicableRule.ruleType !== "PREFERRED",
        severity: hardBlock ? "error" : "warning",
        message: prefixName(
          agentName,
          hardBlock
            ? `début obligatoire à ${applicableRule.fixedStartTime} sur ce site`
            : `heure de début attendue : ${applicableRule.fixedStartTime}`
        ),
        ruleCode: "FIXED_START_TIME_MISMATCH",
      });
    }

    if (
      applicableRule.fixedEndTime &&
      applicableRule.fixedEndTime !== check.endTime
    ) {
      const hardBlock = applicableRule.ruleType === "ONLY";
      results.push({
        authorized: !hardBlock,
        preferred: applicableRule.ruleType !== "PREFERRED",
        severity: hardBlock ? "error" : "warning",
        message: prefixName(
          agentName,
          hardBlock
            ? `fin obligatoire à ${applicableRule.fixedEndTime} sur ce site`
            : `heure de fin attendue : ${applicableRule.fixedEndTime}`
        ),
        ruleCode: "FIXED_END_TIME_MISMATCH",
      });
    }
  }

  if (results.some((r) => !r.authorized)) {
    return results;
  }

  if (results.length === 0) {
    if (onOnlySite || onPreferredSite || onlySiteIds.length === 0) {
      return [
        {
          authorized: true,
          preferred: onPreferredSite || onOnlySite,
          severity: null,
          message: null,
        },
      ];
    }
  }

  return results;
}

export function evaluateAgentSiteAssignment(
  rules: AgentSiteRuleInput[],
  legacy: SiteAuthorization,
  check: SiteAssignmentCheck,
  agentName?: string
): SiteAuthorizationEvaluation {
  const ruleResults = evaluateAgentSiteRules(rules, check, agentName);

  if (ruleResults.length > 0) {
    const blocking = ruleResults.find((r) => !r.authorized);
    if (blocking) return blocking;
    const warning = ruleResults.find((r) => r.severity === "warning");
    if (warning) return warning;
    return ruleResults[0];
  }

  return evaluateSiteAuthorization(legacy, check.siteId, agentName);
}

export function isAgentAuthorizedForSite(
  rules: AgentSiteRuleInput[],
  legacy: SiteAuthorization,
  check: SiteAssignmentCheck
): boolean {
  return evaluateAgentSiteAssignment(rules, legacy, check).authorized;
}

export function deriveLegacyRestriction(rules: AgentSiteRuleInput[]): SiteAuthorization {
  const active = rules.filter((r) => r.active !== false);
  if (active.length === 0) {
    return { siteRestrictionType: "ANY", allowedSiteIds: [] };
  }

  const onlyIds = active.filter((r) => r.ruleType === "ONLY").map((r) => r.siteId);
  const preferredIds = active.filter((r) => r.ruleType === "PREFERRED").map((r) => r.siteId);

  if (onlyIds.length > 0 && preferredIds.length === 0) {
    return { siteRestrictionType: "ONLY", allowedSiteIds: onlyIds };
  }
  if (preferredIds.length > 0 && onlyIds.length === 0) {
    return { siteRestrictionType: "PREFERRED", allowedSiteIds: preferredIds };
  }
  if (onlyIds.length > 0 && preferredIds.length > 0) {
    return {
      siteRestrictionType: "ANY",
      allowedSiteIds: [...new Set([...onlyIds, ...preferredIds])],
    };
  }

  return { siteRestrictionType: "ANY", allowedSiteIds: [] };
}

/** Filter agents authorized for a site (suggestion pre-filter). */
export function isCandidateForSiteNeed(
  rules: AgentSiteRuleInput[],
  legacy: SiteAuthorization,
  check: SiteAssignmentCheck
): boolean {
  return isAgentAuthorizedForSite(rules, legacy, check);
}
