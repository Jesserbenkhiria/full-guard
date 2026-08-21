import type { UnfilledSlotPreview } from "@/types/planning";
import {
  applyBulkFillWithSession,
  type BulkFillResult,
} from "@/services/ai/planning-session";

export type { BulkFillResult };

export async function applyBulkSuggestions(
  planningMonthId: string,
  slots: UnfilledSlotPreview[],
  limit?: number
): Promise<BulkFillResult> {
  return applyBulkFillWithSession(planningMonthId, slots, {
    limit: limit ?? slots.length,
  });
}
