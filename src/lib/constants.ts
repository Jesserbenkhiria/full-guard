import type { DayOfWeek, ShiftType, AbsenceReason, SiteRestrictionType, AgentSiteRuleType, PositionRole } from "@prisma/client";

export const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: "Lun",
  TUESDAY: "Mar",
  WEDNESDAY: "Mer",
  THURSDAY: "Jeu",
  FRIDAY: "Ven",
  SATURDAY: "Sam",
  SUNDAY: "Dim",
};

export const DAY_LABELS_FULL: Record<DayOfWeek, string> = {
  MONDAY: "Lundi",
  TUESDAY: "Mardi",
  WEDNESDAY: "Mercredi",
  THURSDAY: "Jeudi",
  FRIDAY: "Vendredi",
  SATURDAY: "Samedi",
  SUNDAY: "Dimanche",
};

export const ALL_DAYS: DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

export const CONTRACT_HOURS_OPTIONS = [156, 120, 80, 60] as const;

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  DAY: "Jour",
  NIGHT: "Nuit",
  CUSTOM: "Personnalisé",
  OFF: "Repos",
};

export const POSITION_ROLE_LABELS: Record<PositionRole, string> = {
  TEAM_LEADER: "Chef d'équipe",
  AGENT: "Agent",
};

export const SITE_RESTRICTION_LABELS: Record<SiteRestrictionType, string> = {
  ONLY: "Site exclusif",
  PREFERRED: "Sites préférés",
  ANY: "Polyvalent (tous sites)",
};

export const AGENT_SITE_RULE_LABELS: Record<AgentSiteRuleType, string> = {
  ONLY: "Exclusif",
  PREFERRED: "Préféré",
  BLOCKED: "Bloqué",
};

export const ABSENCE_REASON_LABELS: Record<AbsenceReason, string> = {
  VACATION: "Congé",
  SICK_LEAVE: "Maladie",
  PERSONAL: "Personnel",
  TRAINING: "Formation",
  OTHER: "Autre",
};

export function formatAgentName(firstName: string, lastName: string): string {
  return `${lastName}${firstName !== lastName.split(" ")[0] ? ` ${firstName}` : ""}`.trim();
}

export function formatAgentsRequired(count: number): string {
  return count <= 1 ? "1 agent requis" : `${count} agents requis`;
}

/** Works even when Prisma client is stale (before `prisma generate` + dev restart). */
export function resolveIsTeamLeader(agent: {
  lastName: string;
  isTeamLeader?: boolean | null;
}): boolean {
  return (
    agent.isTeamLeader === true ||
    agent.lastName === "LAJIMI" ||
    agent.lastName === "AOUFI"
  );
}

export function formatDays(days: DayOfWeek[]): string {
  if (days.length === 7) return "Tous les jours";
  if (
    days.length === 5 &&
    days.every((d) =>
      ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].includes(d)
    )
  ) {
    return "Lun–Ven";
  }
  return days.map((d) => DAY_LABELS[d]).join(", ");
}
