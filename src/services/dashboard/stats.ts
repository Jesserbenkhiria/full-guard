import { prisma } from "@/lib/db";
import type { DashboardStats } from "@/types";
import { PlanningStatus } from "@prisma/client";

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    totalAgents,
    activeAgents,
    totalSites,
    activeSites,
    planningMonth,
    errorCount,
    warningCount,
  ] = await Promise.all([
    prisma.agent.count(),
    prisma.agent.count({ where: { active: true } }),
    prisma.site.count(),
    prisma.site.count({ where: { active: true } }),
    prisma.planningMonth.findUnique({ where: { year_month: { year, month } } }),
    prisma.alert.count({
      where: {
        severity: "ERROR",
        resolved: false,
        planningMonth: { year, month },
      },
    }),
    prisma.alert.count({
      where: {
        severity: "WARNING",
        resolved: false,
        planningMonth: { year, month },
      },
    }),
  ]);

  // Count unfilled requirement slots (simplified MVP estimate)
  const requirements = await prisma.siteRequirement.findMany({
    where: { active: true },
    select: { agentCount: true },
  });
  const totalRequiredSlots = requirements.reduce((sum, r) => sum + r.agentCount, 0);

  const assignmentCount = planningMonth
    ? await prisma.assignment.count({
        where: { planningMonthId: planningMonth.id },
      })
    : 0;

  const missingAssignments = Math.max(0, totalRequiredSlots * 30 - assignmentCount);

  return {
    totalAgents,
    totalSites,
    activeAgents,
    activeSites,
    planningStatus: planningMonth?.status ?? PlanningStatus.DRAFT,
    errorCount,
    warningCount,
    missingAssignments,
  };
}

export async function getRecentAlerts(limit = 5) {
  const now = new Date();
  return prisma.alert.findMany({
    where: {
      resolved: false,
      planningMonth: { year: now.getFullYear(), month: now.getMonth() + 1 },
    },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      agent: { select: { firstName: true, lastName: true } },
      site: { select: { name: true } },
    },
  });
}
