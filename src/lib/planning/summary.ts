import type {
  PlanningAssignmentDto,
  PlanningSummary,
  SitePlanningGroup,
} from "@/types/planning";

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
