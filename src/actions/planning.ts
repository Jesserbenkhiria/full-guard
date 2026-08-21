"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  failure,
  formatZodErrors,
  getOptionalString,
  getString,
  success,
  type ActionResult,
} from "@/lib/actions";
import { calculateShiftHours } from "@/lib/planning/hours";
import { parseDateKey } from "@/lib/planning/dates";
import { applyBulkSuggestions, type BulkFillResult } from "@/services/planning/auto-fill";
import { fetchBulkSlotSuggestions } from "@/services/ai/planning-session";
import { getAgentSuggestions } from "@/services/planning/suggestions";
import {
  revalidateAfterChange,
  syncAgentContractHoursAlert,
  validateAssignment,
  hasHardWriteConflict,
  type ValidationOutcome,
} from "@/services/rules/validate-assignment";
import { validatePlanningGate, type SiteExportCheck } from "@/services/rules/validate-planning-gate";
import {
  invalidateSitePlanningStatus,
  validateSitePlanningGate,
} from "@/services/rules/validate-site-planning-gate";
import { validateMonthForExport, validateSiteForExport } from "@/services/rules/export-check";
import { getOrCreatePlanningMonth } from "@/services/planning/queries";
import { assignmentSchema } from "@/lib/validations";
import { buildAssignmentWriteData } from "@/lib/prisma/assignment-write";
import type { AgentSuggestion, UnfilledSlotPreview } from "@/types/planning";
import type { ShiftType } from "@prisma/client";

const PLANNING_PATH = "/planning";

function revalidatePlanning() {
  revalidatePath(PLANNING_PATH);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}

export async function createAssignment(formData: FormData): Promise<
  ActionResult<{ id: string; validation: ValidationOutcome }>
> {
  try {
    const parsed = assignmentSchema.parse({
      planningMonthId: getString(formData, "planningMonthId"),
      agentId: getString(formData, "agentId"),
      siteId: getString(formData, "siteId"),
      requirementId: getOptionalString(formData, "requirementId"),
      date: getString(formData, "date"),
      shiftType: getString(formData, "shiftType"),
      role: getString(formData, "role") || undefined,
      startTime: getString(formData, "startTime"),
      endTime: getString(formData, "endTime"),
      hours: getString(formData, "hours") || undefined,
      notes: getOptionalString(formData, "notes"),
    });

    const hours =
      parsed.hours ?? calculateShiftHours(parsed.startTime, parsed.endTime);

    const aiGenerated = getOptionalString(formData, "aiGenerated") === "true";
    const aiConfidenceRaw = getOptionalString(formData, "aiConfidence");
    const aiConfidence = aiConfidenceRaw ? Number(aiConfidenceRaw) : null;
    const aiExplanation = getOptionalString(formData, "aiExplanation");

    const assignment = await prisma.assignment.create({
      data: buildAssignmentWriteData({
        ...parsed,
        hours,
        aiGenerated,
        aiConfidence,
        aiExplanation,
      }),
    });

    const validation = await revalidateAfterChange(assignment.id);

    if (hasHardWriteConflict(validation.results)) {
      await prisma.assignment.delete({ where: { id: assignment.id } });
      const messages = validation.results
        .filter((r) => !r.valid && r.severity === "ERROR")
        .map((r) => r.message)
        .filter(Boolean);
      return failure(
        messages.join(" · ") || "Affectation refusée par les règles métier"
      );
    }

    revalidatePlanning();

    return success({ id: assignment.id, validation });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      return failure("Données invalides", formatZodErrors((err as { issues: [] }).issues));
    }
    return failure(err instanceof Error ? err.message : "Erreur lors de la création");
  }
}

export async function updateAssignment(
  id: string,
  formData: FormData
): Promise<ActionResult<{ validation: ValidationOutcome }>> {
  try {
    const parsed = assignmentSchema.parse({
      planningMonthId: getString(formData, "planningMonthId"),
      agentId: getString(formData, "agentId"),
      siteId: getString(formData, "siteId"),
      requirementId: getOptionalString(formData, "requirementId"),
      date: getString(formData, "date"),
      shiftType: getString(formData, "shiftType"),
      role: getString(formData, "role") || undefined,
      startTime: getString(formData, "startTime"),
      endTime: getString(formData, "endTime"),
      hours: getString(formData, "hours") || undefined,
      notes: getOptionalString(formData, "notes"),
    });

    const hours =
      parsed.hours ?? calculateShiftHours(parsed.startTime, parsed.endTime);

    const existing = await prisma.assignment.findUnique({ where: { id } });
    if (!existing) return failure("Affectation introuvable");

    await prisma.assignment.update({
      where: { id },
      data: buildAssignmentWriteData({ ...parsed, hours }),
    });

    const validation = await revalidateAfterChange(id);

    if (hasHardWriteConflict(validation.results)) {
      await prisma.assignment.update({
        where: { id },
        data: buildAssignmentWriteData({
          planningMonthId: existing.planningMonthId,
          agentId: existing.agentId,
          siteId: existing.siteId,
          requirementId: existing.requirementId ?? undefined,
          date: existing.date,
          shiftType: existing.shiftType,
          role: existing.role,
          startTime: existing.startTime,
          endTime: existing.endTime,
          hours: existing.hours ?? calculateShiftHours(existing.startTime, existing.endTime),
          notes: existing.notes ?? undefined,
        }),
      });
      const messages = validation.results
        .filter((r) => !r.valid && r.severity === "ERROR")
        .map((r) => r.message)
        .filter(Boolean);
      return failure(
        messages.join(" · ") || "Modification refusée par les règles métier"
      );
    }

    if (existing.agentId !== parsed.agentId) {
      await syncAgentContractHoursAlert(existing.agentId, existing.planningMonthId);
    }

    revalidatePlanning();
    return success({ validation });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      return failure("Données invalides", formatZodErrors((err as { issues: [] }).issues));
    }
    return failure(err instanceof Error ? err.message : "Erreur lors de la mise à jour");
  }
}

export async function deleteSiteAssignments(
  planningMonthId: string,
  siteId: string
): Promise<ActionResult<{ deletedCount: number }>> {
  try {
    const assignments = await prisma.assignment.findMany({
      where: { planningMonthId, siteId },
      select: { id: true, agentId: true },
    });

    if (assignments.length === 0) {
      return success({ deletedCount: 0 });
    }

    const assignmentIds = assignments.map((a) => a.id);
    const agentIds = [...new Set(assignments.map((a) => a.agentId))];

    await prisma.alert.deleteMany({
      where: {
        OR: [
          { assignmentId: { in: assignmentIds } },
          { planningMonthId, siteId },
        ],
      },
    });

    await prisma.assignment.deleteMany({
      where: { planningMonthId, siteId },
    });

    for (const agentId of agentIds) {
      const remaining = await prisma.assignment.findMany({
        where: { planningMonthId, agentId },
        select: { id: true },
      });
      for (const { id } of remaining) {
        await validateAssignment(id);
      }
      await syncAgentContractHoursAlert(agentId, planningMonthId);
    }

    await invalidateSitePlanningStatus(planningMonthId, siteId);

    revalidatePlanning();
    return success({ deletedCount: assignments.length });
  } catch (err) {
    return failure(
      err instanceof Error ? err.message : "Erreur lors de la suppression des affectations"
    );
  }
}

export async function deleteAssignment(
  id: string
): Promise<ActionResult<{ validation?: ValidationOutcome }>> {
  try {
    const existing = await prisma.assignment.findUnique({ where: { id } });
    if (!existing) return failure("Affectation introuvable");

    await prisma.alert.deleteMany({ where: { assignmentId: id } });
    await prisma.assignment.delete({ where: { id } });

    await syncAgentContractHoursAlert(existing.agentId, existing.planningMonthId);

    const sameDay = await prisma.assignment.findMany({
      where: {
        planningMonthId: existing.planningMonthId,
        agentId: existing.agentId,
        date: existing.date,
      },
    });
    for (const other of sameDay) {
      await validateAssignment(other.id);
    }

    await invalidateSitePlanningStatus(existing.planningMonthId, existing.siteId);

    revalidatePlanning();
    return success({});
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Erreur lors de la suppression");
  }
}

export async function runSitePlanningValidation(
  planningMonthId: string,
  siteId: string
): Promise<
  ActionResult<{
    errorCount: number;
    warningCount: number;
    validCount: number;
    validated: boolean;
    blockingMessages: string[];
  }>
> {
  try {
    const result = await validateSitePlanningGate(planningMonthId, siteId);
    revalidatePlanning();

    if (!result.canValidate) {
      return failure(
        result.blockingMessages.join(" · ") ||
          "Validation impossible : des erreurs bloquantes subsistent"
      );
    }

    return success({
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      validCount: result.validCount,
      validated: true,
      blockingMessages: [],
    });
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Erreur de validation");
  }
}

export async function runPlanningValidation(
  planningMonthId: string
): Promise<
  ActionResult<{
    errorCount: number;
    warningCount: number;
    validCount: number;
    validated: boolean;
    blockingMessages: string[];
  }>
> {
  try {
    const result = await validatePlanningGate(planningMonthId);
    revalidatePlanning();

    if (!result.canValidate) {
      return failure(
        result.blockingMessages.join(" · ") ||
          "Validation impossible : des erreurs bloquantes subsistent"
      );
    }

    return success({
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      validCount: result.validCount,
      validated: true,
      blockingMessages: [],
    });
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Erreur de validation");
  }
}

export async function checkSiteExportReady(
  year: number,
  month: number,
  siteId: string
): Promise<SiteExportCheck & { planningMonthId: string }> {
  const planningMonth = await getOrCreatePlanningMonth(year, month);
  const check = await validateSiteForExport(planningMonth.id, siteId);
  return { ...check, planningMonthId: planningMonth.id };
}

export async function checkMonthExportReady(
  year: number,
  month: number
): Promise<{ ready: boolean; errorCount: number; warningCount: number; errors: string[] }> {
  const planningMonth = await getOrCreatePlanningMonth(year, month);
  const check = await validateMonthForExport(planningMonth.id);
  return check;
}

export async function fetchAgentSuggestions(input: {
  planningMonthId: string;
  siteId: string;
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  role?: import("@prisma/client").PositionRole;
  excludeAssignmentId?: string;
}): Promise<AgentSuggestion[]> {
  return getAgentSuggestions({
    ...input,
    date: new Date(input.date),
  });
}

export async function fetchBulkSlotPreviewsAction(
  planningMonthId: string,
  slots: UnfilledSlotPreview[],
  limit = 12
): Promise<(UnfilledSlotPreview & { suggestions: AgentSuggestion[] })[]> {
  return fetchBulkSlotSuggestions(planningMonthId, slots.slice(0, limit), {
    simulateSequential: true,
  });
}

export async function applyBulkSuggestionsAction(
  planningMonthId: string,
  slots: UnfilledSlotPreview[]
): Promise<ActionResult<BulkFillResult>> {
  try {
    const result = await applyBulkSuggestions(planningMonthId, slots);
    revalidatePlanning();
    return success(result);
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Erreur lors du remplissage automatique");
  }
}

export async function moveAssignmentToSlot(
  assignmentId: string,
  slot: {
    siteId: string;
    date: string;
    shiftType: ShiftType;
    startTime: string;
    endTime: string;
    planningMonthId: string;
    requirementId?: string;
    role?: import("@prisma/client").PositionRole;
  }
): Promise<ActionResult<{ validation: ValidationOutcome }>> {
  try {
    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return failure("Affectation introuvable");

    const slotDate = parseDateKey(slot.date);
    const conflicting = await prisma.assignment.findFirst({
      where: {
        planningMonthId: slot.planningMonthId,
        siteId: slot.siteId,
        date: slotDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        NOT: { id: assignmentId },
      },
    });

    if (conflicting) {
      return failure("Un agent est déjà affecté à ce créneau");
    }

    const hours = calculateShiftHours(slot.startTime, slot.endTime);

    await prisma.assignment.update({
      where: { id: assignmentId },
      data: buildAssignmentWriteData({
        planningMonthId: assignment.planningMonthId,
        agentId: assignment.agentId,
        siteId: slot.siteId,
        requirementId: slot.requirementId ?? assignment.requirementId,
        date: slotDate,
        shiftType: slot.shiftType,
        role: slot.role ?? assignment.role,
        startTime: slot.startTime,
        endTime: slot.endTime,
        hours,
        notes: assignment.notes,
      }),
    });

    const validation = await revalidateAfterChange(assignmentId);
    revalidatePlanning();
    return success({ validation });
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Erreur lors du déplacement");
  }
}

export async function generateSuggestionsStub(): Promise<ActionResult<{ message: string }>> {
  return success({
    message: "Suggestions automatiques — disponible en phase 6",
  });
}

export async function exportPlanningPdfStub(): Promise<ActionResult<{ message: string }>> {
  return success({
    message: "Export PDF — disponible en phase 7",
  });
}
