import { AlertSeverity } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { PlanningAssignmentDto, PlanningData } from "@/types/planning";
import type { SiteExportCheck } from "@/services/rules/validate-planning-gate";

function collectAssignmentExportStats(assignments: PlanningAssignmentDto[]): SiteExportCheck {
  const errors = new Set<string>();
  let errorCount = 0;
  let warningCount = 0;

  for (const assignment of assignments) {
    if (assignment.validationStatus === "error") {
      errorCount++;
      for (const alert of assignment.alerts) {
        if (alert.severity === "ERROR" && alert.message) errors.add(alert.message);
      }
    } else if (assignment.validationStatus === "warning") {
      warningCount++;
    }
  }

  return {
    ready: errorCount === 0,
    errorCount,
    warningCount,
    errors: [...errors],
  };
}

function siteAssignments(data: PlanningData, siteId: string): PlanningAssignmentDto[] {
  const site = data.sites.find((s) => s.siteId === siteId);
  if (!site) return [];

  const assignments: PlanningAssignmentDto[] = [];
  for (const row of site.shiftRows) {
    for (const slots of Object.values(row.slotsByDate)) {
      for (const slot of slots) {
        if (slot.assignment) assignments.push(slot.assignment);
      }
    }
  }
  return assignments;
}

/** Instant export check from already-loaded planning data (uses cached alerts). */
export function computeSiteExportCheck(data: PlanningData, siteId: string): SiteExportCheck {
  return collectAssignmentExportStats(siteAssignments(data, siteId));
}

export function computeMonthExportCheck(data: PlanningData): SiteExportCheck {
  const assignments = data.sites.flatMap((site) => siteAssignments(data, site.siteId));
  return collectAssignmentExportStats(assignments);
}

/** Fast DB check — reads existing alerts, does not re-run the rules engine. */
export async function validateSiteForExport(
  planningMonthId: string,
  siteId: string
): Promise<SiteExportCheck> {
  const errorAlerts = await prisma.alert.findMany({
    where: {
      planningMonthId,
      siteId,
      severity: AlertSeverity.ERROR,
      resolved: false,
      assignmentId: { not: null },
    },
    select: { assignmentId: true, message: true },
  });

  const warningCount = await prisma.alert.count({
    where: {
      planningMonthId,
      siteId,
      severity: AlertSeverity.WARNING,
      resolved: false,
      assignmentId: { not: null },
    },
  });

  const errorAssignmentIds = new Set(
    errorAlerts.map((a) => a.assignmentId).filter((id): id is string => id != null)
  );
  const errors = [...new Set(errorAlerts.map((a) => a.message).filter(Boolean))];

  return {
    ready: errorAssignmentIds.size === 0,
    errorCount: errorAssignmentIds.size,
    warningCount,
    errors,
  };
}

export async function validateMonthForExport(planningMonthId: string): Promise<SiteExportCheck> {
  const errorAlerts = await prisma.alert.findMany({
    where: {
      planningMonthId,
      severity: AlertSeverity.ERROR,
      resolved: false,
      assignmentId: { not: null },
    },
    select: { assignmentId: true, message: true },
  });

  const warningCount = await prisma.alert.count({
    where: {
      planningMonthId,
      severity: AlertSeverity.WARNING,
      resolved: false,
      assignmentId: { not: null },
    },
  });

  const errorAssignmentIds = new Set(
    errorAlerts.map((a) => a.assignmentId).filter((id): id is string => id != null)
  );
  const errors = [...new Set(errorAlerts.map((a) => a.message).filter(Boolean))];

  return {
    ready: errorAssignmentIds.size === 0,
    errorCount: errorAssignmentIds.size,
    warningCount,
    errors,
  };
}
