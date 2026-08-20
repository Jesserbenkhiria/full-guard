import type { UnfilledSlotPreview } from "@/types/planning";
import {
  applyBulkFillWithSession,
  type BulkFillResult,
} from "@/services/ai/planning-session";

export type { BulkFillResult };

const DEFAULT_LIMIT = 40;

export async function applyBulkSuggestions(
  planningMonthId: string,
  slots: UnfilledSlotPreview[],
  limit = DEFAULT_LIMIT
): Promise<BulkFillResult> {
  return applyBulkFillWithSession(planningMonthId, slots, { limit });
}
