import type {
  PlanningAssignmentDto,
  PlanningSummary,
  SitePlanningGroup,
} from "@/types/planning";
import { calculateShiftHours } from "@/lib/planning/hours";
import { isWeekendDateKey, parseDateKey } from "@/lib/planning/dates";
import { weekendPeriodKey } from "@/lib/planning/weekends";

export type SiteAgentPrintTotals = {
  agentId: string;
  agentName: string;
  hours: number;
  vacations: number;
  weekends: number;
};

export function computePlanningSummary(
  sites: SitePlanningGroup[],
  assignments: PlanningAssignmentDto[]
): PlanningSummary {
  let totalSlots = 0;
  let filledSlots = 0;

  const activeSites = new Set<string>();

  for (const site of sites) {
    for (const row of site.shiftRows) {
      for (const daySlots of Object.values(row.slotsByDate)) {
        for (const slot of daySlots) {
          if (slot.slotIndex >= slot.requiredAgents) continue;
          totalSlots++;
          activeSites.add(site.siteId);
          if (slot.assignment) filledSlots++;
        }
      }
    }
  }

  const alertCount = assignments.filter((a) => a.validationStatus !== "valid").length;

  return {
    siteCount: activeSites.size,
    totalSlots,
    filledSlots,
    missingSlots: totalSlots - filledSlots,
    alertCount,
  };
}

export function computeSiteCoverage(
  site: SitePlanningGroup
): { total: number; filled: number; missing: number } {
  let total = 0;
  let filled = 0;

  for (const row of site.shiftRows) {
    for (const daySlots of Object.values(row.slotsByDate)) {
      for (const slot of daySlots) {
        if (slot.slotIndex >= slot.requiredAgents) continue;
        total++;
        if (slot.assignment) filled++;
      }
    }
  }

  return { total, filled, missing: total - filled };
}

export function collectSiteAgentHours(
  site: SitePlanningGroup
): SiteAgentPrintTotals[] {
  const byAgent = new Map<
    string,
    SiteAgentPrintTotals & { weekendKeys: Set<string> }
  >();
  const seen = new Set<string>();

  for (const row of site.shiftRows) {
    for (const daySlots of Object.values(row.slotsByDate)) {
      for (const slot of daySlots) {
        const assignment = slot.assignment;
        if (!assignment || seen.has(assignment.id)) continue;
        seen.add(assignment.id);
        const hours =
          assignment.hours ??
          calculateShiftHours(assignment.startTime, assignment.endTime);
        const prev = byAgent.get(assignment.agentId);
        if (prev) {
          prev.hours = Math.round((prev.hours + hours) * 10) / 10;
          prev.vacations += 1;
          if (isWeekendDateKey(assignment.date)) {
            prev.weekendKeys.add(weekendPeriodKey(parseDateKey(assignment.date)));
          }
        } else {
          const weekendKeys = new Set<string>();
          if (isWeekendDateKey(assignment.date)) {
            weekendKeys.add(weekendPeriodKey(parseDateKey(assignment.date)));
          }
          byAgent.set(assignment.agentId, {
            agentId: assignment.agentId,
            agentName: assignment.agentName,
            hours,
            vacations: 1,
            weekends: 0,
            weekendKeys,
          });
        }
      }
    }
  }

  return [...byAgent.values()]
    .map(({ weekendKeys, ...agent }) => ({
      ...agent,
      weekends: weekendKeys.size,
    }))
    .sort((a, b) => a.agentName.localeCompare(b.agentName, "fr"));
}
