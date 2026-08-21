"use server";

import { revalidatePath } from "next/cache";
import {
  failure,
  success,
  type ActionResult,
} from "@/lib/actions";
import {
  autoAssignVacation,
  generateMonthlyPlanning,
  getAiPlanningSuggestions,
} from "@/services/ai/planningAssistant";
import {
  applyBulkFillWithSession,
  applySingleSlotFill,
  fetchBulkSlotSuggestions,
} from "@/services/ai/planning-session";
import type { AgentSuggestion, UnfilledSlotPreview } from "@/types/planning";
import type { ShiftType } from "@prisma/client";

const PLANNING_PATH = "/planning";

function revalidatePlanning() {
  revalidatePath(PLANNING_PATH);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function fetchAiAgentSuggestions(input: {
  planningMonthId: string;
  siteId: string;
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  role?: import("@prisma/client").PositionRole;
  excludeAssignmentId?: string;
}): Promise<AgentSuggestion[]> {
  return getAiPlanningSuggestions({
    ...input,
    date: new Date(input.date),
  });
}

export async function autoAssignVacationAction(input: {
  planningMonthId: string;
  siteId: string;
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  role?: import("@prisma/client").PositionRole;
  requirementId?: string;
}): Promise<
  ActionResult<{
    assignmentId: string;
    agentName: string;
    aiExplanation?: string;
    aiConfidence?: number;
  }>
> {
  try {
    const result = await autoAssignVacation({
      ...input,
      date: new Date(input.date),
    });

    if (!result.success || !result.assignmentId) {
      return failure(result.error ?? "Affectation automatique impossible");
    }

    revalidatePlanning();

    return success({
      assignmentId: result.assignmentId,
      agentName: result.agentName ?? "",
      aiExplanation: result.aiExplanation,
      aiConfidence: result.aiConfidence,
    });
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Erreur IA");
  }
}

export async function generateMonthlyPlanningAction(input: {
  year: number;
  month: number;
  siteIds?: string[];
  limit?: number;
}): Promise<
  ActionResult<{
    applied: number;
    skipped: number;
    errors: string[];
  }>
> {
  try {
    const result = await generateMonthlyPlanning(input);
    revalidatePlanning();
    return success({
      applied: result.applied,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Erreur génération IA");
  }
}

export async function fetchBulkSlotPreviewsAction(
  planningMonthId: string,
  slots: UnfilledSlotPreview[],
  limit = 12
): Promise<(UnfilledSlotPreview & { suggestions: AgentSuggestion[] })[]> {
  return fetchBulkSlotSuggestions(planningMonthId, slots.slice(0, limit), {
    useAi: true,
    simulateSequential: true,
  });
}

export async function applyAiBulkSuggestionsAction(
  planningMonthId: string,
  slots: UnfilledSlotPreview[],
  limit = 40
): Promise<
  ActionResult<{ applied: number; skipped: number; errors: string[] }>
> {
  try {
    const result = await applyBulkFillWithSession(planningMonthId, slots, {
      limit: slots.length,
      useAi: true,
      aiGenerated: true,
    });

    revalidatePlanning();
    return success(result);
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Erreur remplissage IA");
  }
}

export async function finalizePlanningFillAction(): Promise<ActionResult<{ ok: true }>> {
  revalidatePlanning();
  return success({ ok: true });
}

export async function applySingleSlotFillAction(
  planningMonthId: string,
  slot: UnfilledSlotPreview,
  useAi: boolean
): Promise<
  ActionResult<{
    status: string;
    agentName?: string;
    error?: string;
  }>
> {
  try {
    const result = await applySingleSlotFill(planningMonthId, slot, { useAi });
    return success({
      status: result.status,
      agentName: result.agentName,
      error: result.error,
    });
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Erreur affectation");
  }
}

export async function isAiPlanningAvailable(): Promise<boolean> {
  const { isOpenAiConfigured } = await import("@/services/ai/openai-client");
  return isOpenAiConfigured();
}
