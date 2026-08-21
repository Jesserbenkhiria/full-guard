import { prisma } from "@/lib/db";
import { formatAgentName } from "@/lib/constants";
import { calculateShiftHours, getRemainingContractHours, sumAssignmentHours } from "@/lib/planning/hours";
import {
  evaluateAgentForSlot,
  loadAgentsAvailabilityForDate,
  mapRuleResultsToReasons,
  type VacationSlot,
} from "@/services/rules/eligibility";
import { createConfiguredEngine } from "@/services/rules/load-engine";
import { clampScore, scoreAssignmentFit, teamAverageHours } from "@/services/planning/score-fit";
import { loadReferenceStatsFromDb } from "@/services/planning/reference-stats";
import {
  buildDedicatedSiteIds,
  compareAgentsForSlot,
  getAgentSlotDedication,
  isAgentAllowedOnDedicatedSite,
  type SlotPickContext,
} from "@/services/planning/constraint-priority";
import type { AgentSuggestion, SuggestionReasonDetail } from "@/types/planning";
import type { Agent, AgentSiteRule, ShiftType } from "@prisma/client";
import { fr } from "@/lib/i18n/fr";

type SuggestionInput = {
  planningMonthId: string;
  siteId: string;
  date: Date;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  role?: import("@prisma/client").PositionRole;
  excludeAssignmentId?: string;
};

type AgentWithRules = Agent & { siteRules: AgentSiteRule[] };

function addReason(
  reasons: string[],
  reasonDetails: SuggestionReasonDetail[],
  text: string,
  type: SuggestionReasonDetail["type"]
) {
  if (!reasons.includes(text)) {
    reasons.push(text);
    reasonDetails.push({ text, type });
  }
}

/**
 * Suggestions powered by the rules engine — only ERROR-free agents are accepted.
 * Site-dedicated agents (e.g. MBODJI on LE DOUZE Mon/Tue) rank above polyvalent fillers.
 */
export async function getAgentSuggestions(
  input: SuggestionInput
): Promise<AgentSuggestion[]> {
  const planningMonth = await prisma.planningMonth.findUnique({
    where: { id: input.planningMonthId },
  });
  if (!planningMonth) return [];

  const slot: VacationSlot = {
    planningMonthId: input.planningMonthId,
    siteId: input.siteId,
    date: input.date,
    shiftType: input.shiftType,
    startTime: input.startTime,
    endTime: input.endTime,
    role: input.role,
    excludeAssignmentId: input.excludeAssignmentId,
  };

  const [agents, site, monthAssignments, siteHistory, engine, referenceStats] = await Promise.all([
    prisma.agent.findMany({
      where: { active: true },
      include: { siteRules: { where: { active: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }) as Promise<AgentWithRules[]>,
    prisma.site.findUnique({ where: { id: input.siteId }, select: { name: true } }),
    prisma.assignment.findMany({
      where: { planningMonthId: input.planningMonthId },
    }),
    prisma.assignment.groupBy({
      by: ["agentId"],
      where: { siteId: input.siteId },
      _count: { id: true },
    }),
    createConfiguredEngine(),
    loadReferenceStatsFromDb(prisma),
  ]);

  const siteName = site?.name ?? "";
  const siteCountMap = new Map(siteHistory.map((s) => [s.agentId, s._count.id]));
  const shiftHours = calculateShiftHours(input.startTime, input.endTime);
  const avgHours = teamAverageHours(monthAssignments, agents.length);
  const availabilityMap = await loadAgentsAvailabilityForDate(
    agents.map((a) => a.id),
    input.date
  );

  const suggestions: AgentSuggestion[] = [];
  const dedicatedSiteIds = buildDedicatedSiteIds(agents);
  const pickCtx: SlotPickContext = {
    siteId: input.siteId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    shiftType: input.shiftType,
    role: input.role,
  };

  for (const agent of agents) {
    const agentName = formatAgentName(agent.firstName, agent.lastName);
    const availability = availabilityMap.get(agent.id)!;

    const { eligible, results } = await evaluateAgentForSlot(
      agent,
      slot,
      siteName,
      monthAssignments,
      availability,
      engine
    );

    const mapped = mapRuleResultsToReasons(results);
    let score = eligible ? 55 : 0;
    let accepted = eligible;

    if (
      accepted &&
      !isAgentAllowedOnDedicatedSite(agent, input.siteId, dedicatedSiteIds, input.date)
    ) {
      accepted = false;
      score = 0;
      addReason(
        mapped.reasons,
        mapped.reasonDetails,
        fr.planning.sitePoolRequired,
        "error"
      );
    }

    if (accepted) {
      const agentMonthCount = monthAssignments.filter(
        (a) => a.agentId === agent.id && a.siteId === input.siteId
      ).length;
      const warningCount = mapped.reasonDetails.filter((r) => r.type === "warn").length;
      const fit = scoreAssignmentFit({
        agent,
        siteId: input.siteId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        shiftHours,
        shiftType: input.shiftType,
        monthAssignments,
        siteHistoryCount: agentMonthCount,
        allTimeSiteCount: siteCountMap.get(agent.id) ?? 0,
        teamAvgHours: avgHours,
        warningCount,
        referenceStats,
      });
      score += fit.delta;
      for (const reason of fit.reasons) {
        addReason(mapped.reasons, mapped.reasonDetails, reason.text, reason.type);
      }
      if (getAgentSlotDedication(agent, pickCtx) >= 100) {
        addReason(mapped.reasons, mapped.reasonDetails, fr.planning.dedicatedAgent, "ok");
      }
    }

    if (!accepted && mapped.reasons.length === 0) {
      addReason(mapped.reasons, mapped.reasonDetails, "Non éligible", "error");
    }

    const agentMonthAssignments = monthAssignments.filter(
      (a) => a.agentId === agent.id && a.id !== input.excludeAssignmentId
    );
    const workedHours = sumAssignmentHours(agentMonthAssignments);
    const remainingHours = getRemainingContractHours(agent.contractHours, workedHours);

    suggestions.push({
      agentId: agent.id,
      agentName,
      score: clampScore(score),
      accepted,
      reasons: mapped.reasons,
      reasonDetails: mapped.reasonDetails,
      contractHours: agent.contractHours,
      workedHours,
      remainingHours,
      shiftHours,
    });
  }

  return suggestions.sort((a, b) => {
    const agentsById = new Map(agents.map((a) => [a.id, a]));
    return compareAgentsForSlot(a, b, agentsById, pickCtx);
  });
}
