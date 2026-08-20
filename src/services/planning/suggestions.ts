import { prisma } from "@/lib/db";
import { formatAgentName, POSITION_ROLE_LABELS, resolveIsTeamLeader } from "@/lib/constants";
import { calculateShiftHours, sumAssignmentHours } from "@/lib/planning/hours";
import {
  evaluateAgentForSlot,
  loadAgentsAvailabilityForDate,
  mapRuleResultsToReasons,
  scoreSiteFit,
  type VacationSlot,
} from "@/services/rules/eligibility";
import { createConfiguredEngine } from "@/services/rules/load-engine";
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

  const [agents, site, monthAssignments, siteHistory, engine] = await Promise.all([
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
  ]);

  const siteName = site?.name ?? "";
  const siteCountMap = new Map(siteHistory.map((s) => [s.agentId, s._count.id]));
  const shiftHours = calculateShiftHours(input.startTime, input.endTime);
  const availabilityMap = await loadAgentsAvailabilityForDate(
    agents.map((a) => a.id),
    input.date
  );

  const suggestions: AgentSuggestion[] = [];

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
    let score = eligible ? 70 : 0;
    let accepted = eligible;

    if (input.role === "TEAM_LEADER") {
      if (!resolveIsTeamLeader(agent)) {
        accepted = false;
        score = 0;
        addReason(
          mapped.reasons,
          mapped.reasonDetails,
          `Poste ${POSITION_ROLE_LABELS.TEAM_LEADER} requis`,
          "error"
        );
      }
    }

    if (accepted) {
      score += scoreSiteFit(agent, input.siteId, input.date);

      const siteRule = agent.siteRules.find((r) => r.siteId === input.siteId);
      if (siteRule?.fixedStartTime && siteRule.fixedStartTime === input.startTime) {
        score += 8;
        addReason(mapped.reasons, mapped.reasonDetails, fr.planning.scheduleCompatible, "ok");
      } else if (siteRule?.fixedStartTime) {
        score -= 5;
      }

      const agentMonthAssignments = monthAssignments.filter((a) => a.agentId === agent.id);
      const hourCap = siteRule?.maxHours ?? agent.contractHours;
      if (hourCap) {
        const projected = sumAssignmentHours(agentMonthAssignments) + shiftHours;
        if (projected <= hourCap * 0.85) {
          score += 5;
          addReason(mapped.reasons, mapped.reasonDetails, "Contrat OK", "ok");
        } else if (projected <= hourCap) {
          addReason(
            mapped.reasons,
            mapped.reasonDetails,
            `${fr.planning.nearHourLimit} ${hourCap}h`,
            "warn"
          );
        }
      }

      const siteCount = siteCountMap.get(agent.id) ?? 0;
      if (siteCount >= 3) {
        score += 4;
        addReason(mapped.reasons, mapped.reasonDetails, "Connaît bien ce site", "ok");
      }
    }

    if (!accepted && mapped.reasons.length === 0) {
      addReason(mapped.reasons, mapped.reasonDetails, "Non éligible", "error");
    }

    suggestions.push({
      agentId: agent.id,
      agentName,
      score: Math.max(0, Math.min(100, score)),
      accepted,
      reasons: mapped.reasons,
      reasonDetails: mapped.reasonDetails,
    });
  }

  return suggestions.sort((a, b) => {
    if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
    return b.score - a.score;
  });
}
