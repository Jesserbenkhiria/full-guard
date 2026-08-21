import { prisma } from "@/lib/db";
import { computePlanningSummary } from "@/lib/planning/summary";
import { formatAgentName, resolveIsTeamLeader } from "@/lib/constants";
import { getDayOfWeek, getMonthDays, toDateKey } from "@/lib/planning/dates";
import { sumAssignmentHours, getRemainingContractHours } from "@/lib/planning/hours";
import {
  assignmentsMatchSlot,
  formatShiftLabel,
  isRequirementSupersededOnDate,
  isSpecificDateInMonth,
  toShiftTemplate,
} from "@/lib/planning/shift-templates";
import type {
  AgentPlanningRow,
  PlanningAssignmentDto,
  PlanningData,
  PlanningMonthDto,
  PlanningSlotDto,
  ShiftPlanningRow,
  SitePlanningGroup,
  UnfilledSlotPreview,
} from "@/types/planning";
import type { ShiftType, PlanningStatus } from "@prisma/client";

function mapValidationStatus(
  alerts: { severity: string }[]
): "valid" | "warning" | "error" {
  if (alerts.some((a) => a.severity === "ERROR")) return "error";
  if (alerts.some((a) => a.severity === "WARNING")) return "warning";
  return "valid";
}

function mapAssignment(
  a: {
    id: string;
    planningMonthId: string;
    agentId: string;
    agent: { firstName: string; lastName: string };
    siteId: string;
    site: { name: string };
    requirementId: string | null;
    date: Date;
    shiftType: ShiftType;
    role: import("@prisma/client").PositionRole;
    startTime: string;
    endTime: string;
  hours: number | null;
  notes: string | null;
  aiGenerated?: boolean;
  aiConfidence?: number | null;
  aiExplanation?: string | null;
  alerts: { id: string; ruleCode: string; severity: string; message: string }[];
  }
): PlanningAssignmentDto {
  const alerts = a.alerts.map((alert) => ({
    id: alert.id,
    ruleCode: alert.ruleCode,
    severity: alert.severity as "ERROR" | "WARNING" | "SUCCESS",
    message: alert.message,
  }));

  return {
    id: a.id,
    planningMonthId: a.planningMonthId,
    agentId: a.agentId,
    agentName: formatAgentName(a.agent.firstName, a.agent.lastName),
    siteId: a.siteId,
    siteName: a.site.name,
    requirementId: a.requirementId,
    date: toDateKey(a.date),
    shiftType: a.shiftType,
    role: a.role,
    startTime: a.startTime,
    endTime: a.endTime,
    hours: a.hours,
    notes: a.notes,
    aiGenerated: a.aiGenerated ?? false,
    aiConfidence: a.aiConfidence,
    aiExplanation: a.aiExplanation,
    alerts,
    validationStatus: mapValidationStatus(alerts),
  };
}

function buildSiteGroups(
  sites: {
    id: string;
    name: string;
    requirements: {
      id: string;
      siteId: string;
      label: string | null;
      days: import("@prisma/client").DayOfWeek[];
      shiftType: ShiftType;
      startTime: string;
      endTime: string;
      agentCount: number;
      role: import("@prisma/client").PositionRole;
      specificDate: Date | null;
      active: boolean;
    }[];
  }[],
  assignments: PlanningAssignmentDto[],
  year: number,
  month: number,
  habitualBySite: Map<string, string[]>,
  teamLeaderBySite: Map<string, string[]>,
  siteValidationById: Map<string, { status: PlanningStatus; validatedAt: Date | null }>
): SitePlanningGroup[] {
  return sites.map((site) => {
    const activeReqs = site.requirements.filter(
      (r) => r.active && isSpecificDateInMonth(r.specificDate, year, month)
    );

    const templates = activeReqs.map(toShiftTemplate);

    const shiftRows: ShiftPlanningRow[] = activeReqs.map((req, reqIndex) => {
      const template = templates[reqIndex];
      const label =
        req.label ??
        formatShiftLabel(req.startTime, req.endTime);

      const slotsByDate: Record<string, PlanningSlotDto[]> = {};
      const monthDays = getMonthDays(year, month);

      for (const day of monthDays) {
        const dateKey = toDateKey(day);
        if (!template.specificDate && !template.days.includes(getDayOfWeek(day))) {
          continue;
        }
        if (template.specificDate && template.specificDate !== dateKey) {
          continue;
        }
        if (isRequirementSupersededOnDate(template, dateKey, templates)) {
          continue;
        }

        const matching = assignments.filter((a) =>
          assignmentsMatchSlot(a, {
            siteId: site.id,
            date: dateKey,
            startTime: req.startTime,
            endTime: req.endTime,
            requirementId: req.id,
            role: req.role ?? "AGENT",
          })
        );

        const slots: PlanningSlotDto[] = [];
        for (let i = 0; i < req.agentCount; i++) {
          slots.push({
            id: `${req.id}:${dateKey}:${i}`,
            siteId: site.id,
            requirementId: req.id,
            date: dateKey,
            shiftType: req.shiftType,
            role: req.role ?? "AGENT",
            startTime: req.startTime,
            endTime: req.endTime,
            slotIndex: i,
            requiredAgents: req.agentCount,
            assignment: matching[i] ?? null,
          });
        }

        for (let i = req.agentCount; i < matching.length; i++) {
          slots.push({
            id: `${req.id}:${dateKey}:extra:${i}`,
            siteId: site.id,
            requirementId: req.id,
            date: dateKey,
            shiftType: req.shiftType,
            role: req.role ?? "AGENT",
            startTime: req.startTime,
            endTime: req.endTime,
            slotIndex: i,
            requiredAgents: req.agentCount,
            assignment: matching[i] ?? null,
          });
        }

        if (slots.length > 0) {
          slotsByDate[dateKey] = slots;
        }
      }

      return {
        requirementId: req.id,
        label,
        role: req.role ?? "AGENT",
        shiftType: req.shiftType,
        startTime: req.startTime,
        endTime: req.endTime,
        agentCount: req.agentCount,
        slotsByDate,
      };
    });

    return {
      siteId: site.id,
      siteName: site.name,
      habitualAgents: habitualBySite.get(site.id) ?? [],
      teamLeaderHints: teamLeaderBySite.get(site.id) ?? [],
      shiftRows,
      validationStatus: siteValidationById.get(site.id)?.status ?? "DRAFT",
      validatedAt: siteValidationById.get(site.id)?.validatedAt?.toISOString() ?? null,
    };
  });
}

function buildAgentRows(
  agents: {
    id: string;
    firstName: string;
    lastName: string;
    contractHours: number | null;
    overtimeAllowed: boolean;
    active: boolean;
  }[],
  days: string[],
  assignments: PlanningAssignmentDto[]
): AgentPlanningRow[] {
  return agents
    .filter((a) => a.active)
    .map((agent) => {
      const agentAssignments = assignments.filter((a) => a.agentId === agent.id);
      const totalHours = sumAssignmentHours(agentAssignments);
      const contractHours = agent.contractHours;
      const remainingHours = getRemainingContractHours(contractHours, totalHours);
      const overtimeHours =
        contractHours && totalHours > contractHours
          ? Math.round((totalHours - contractHours) * 10) / 10
          : 0;

      const daysCells = days.map((date) => {
        const dayAssignments = agentAssignments.filter((a) => a.date === date);
        if (dayAssignments.length === 0) {
          return {
            date,
            shiftType: null,
            siteName: null,
            assignmentId: null,
            startTime: null,
            endTime: null,
            validationStatus: "off" as const,
            alertMessage: null,
          };
        }

        const primary = dayAssignments[0];
        const worstStatus = dayAssignments.some((a) => a.validationStatus === "error")
          ? "error"
          : dayAssignments.some((a) => a.validationStatus === "warning")
            ? "warning"
            : "valid";

        const primaryAlert =
          dayAssignments
            .flatMap((a) => a.alerts)
            .find((a) => a.severity === "ERROR")?.message ??
          dayAssignments
            .flatMap((a) => a.alerts)
            .find((a) => a.severity === "WARNING")?.message ??
          null;

        return {
          date,
          shiftType: primary.shiftType,
          siteName: dayAssignments.map((a) => a.siteName).join(", "),
          assignmentId: primary.id,
          startTime: primary.startTime,
          endTime: primary.endTime,
          validationStatus: worstStatus as "valid" | "warning" | "error",
          alertMessage: primaryAlert,
        };
      });

      return {
        agentId: agent.id,
        agentName: formatAgentName(agent.firstName, agent.lastName),
        contractHours,
        overtimeAllowed: agent.overtimeAllowed,
        days: daysCells,
        totalHours,
        overtimeHours,
        remainingHours,
      };
    });
}

export async function getOrCreatePlanningMonth(
  year: number,
  month: number
): Promise<PlanningMonthDto> {
  const existing = await prisma.planningMonth.findUnique({
    where: { year_month: { year, month } },
  });

  if (existing) {
    return {
      id: existing.id,
      year: existing.year,
      month: existing.month,
      status: existing.status,
    };
  }

  const created = await prisma.planningMonth.create({
    data: { year, month },
  });

  return {
    id: created.id,
    year: created.year,
    month: created.month,
    status: created.status,
  };
}

export async function getPlanningData(
  year: number,
  month: number
): Promise<PlanningData> {
  const planningMonth = await getOrCreatePlanningMonth(year, month);
  const days = getMonthDays(year, month).map(toDateKey);

  const [sites, agents, rawAssignments, siteRules, sitePlannings] = await Promise.all([
    prisma.site.findMany({
      where: { active: true },
      include: {
        requirements: { where: { active: true }, orderBy: { priority: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.agent.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.assignment.findMany({
      where: { planningMonthId: planningMonth.id },
      include: {
        agent: true,
        site: true,
        alerts: { where: { resolved: false } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.agentSiteRule.findMany({
      where: { active: true, ruleType: { in: ["ONLY", "PREFERRED"] } },
      include: {
        agent: {
          select: { firstName: true, lastName: true, active: true },
        },
      },
      orderBy: [{ ruleType: "asc" }, { agent: { lastName: "asc" } }],
    }),
    prisma.sitePlanningMonth.findMany({
      where: { planningMonthId: planningMonth.id },
      select: { siteId: true, status: true, validatedAt: true },
    }),
  ]);

  const teamLeaderIds = new Set(
    agents.filter((a) => resolveIsTeamLeader(a)).map((a) => a.id)
  );

  const habitualBySite = new Map<string, string[]>();
  const teamLeaderBySite = new Map<string, string[]>();
  for (const rule of siteRules) {
    if (!rule.agent.active) continue;
    const name = formatAgentName(rule.agent.firstName, rule.agent.lastName);
    const list = habitualBySite.get(rule.siteId) ?? [];
    list.push(name);
    habitualBySite.set(rule.siteId, list);
    if (teamLeaderIds.has(rule.agentId)) {
      const leaders = teamLeaderBySite.get(rule.siteId) ?? [];
      leaders.push(name);
      teamLeaderBySite.set(rule.siteId, leaders);
    }
  }

  const assignments = rawAssignments.map(mapAssignment);
  const siteValidationById = new Map(
    sitePlannings.map((s) => [s.siteId, { status: s.status, validatedAt: s.validatedAt }])
  );
  const siteGroups = buildSiteGroups(
    sites,
    assignments,
    year,
    month,
    habitualBySite,
    teamLeaderBySite,
    siteValidationById
  );
  const agentRows = buildAgentRows(agents, days, assignments);
  const summary = computePlanningSummary(siteGroups, assignments);

  const unfilledSlots: UnfilledSlotPreview[] = [];
  for (const site of siteGroups) {
    for (const row of site.shiftRows) {
      for (const [date, daySlots] of Object.entries(row.slotsByDate)) {
        for (const slot of daySlots) {
          if (slot.slotIndex >= slot.requiredAgents) continue;
          if (!slot.assignment) {
            unfilledSlots.push({
              slotId: slot.id,
              siteId: site.siteId,
              siteName: site.siteName,
              requirementId: slot.requirementId,
              date,
              startTime: slot.startTime,
              endTime: slot.endTime,
              shiftType: slot.shiftType,
              role: slot.role,
              slotIndex: slot.slotIndex,
              requiredAgents: slot.requiredAgents,
            });
          }
        }
      }
    }
  }

  return {
    planningMonth,
    days,
    sites: siteGroups,
    agents: agentRows,
    assignments,
    agentOptions: agents
      .filter((a) => a.active)
      .map((a) => ({ id: a.id, name: formatAgentName(a.firstName, a.lastName) })),
    siteOptions: sites.map((s) => ({ id: s.id, name: s.name })),
    summary,
    unfilledSlots,
  };
}

export async function getDefaultPlanningPeriod(): Promise<{ year: number; month: number }> {
  const latest = await prisma.planningMonth.findFirst({
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  if (latest) return { year: latest.year, month: latest.month };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
