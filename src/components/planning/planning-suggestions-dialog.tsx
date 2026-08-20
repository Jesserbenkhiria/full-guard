"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteLabel } from "@/components/shared/site-label";
import { applyBulkSuggestionsAction, fetchBulkSlotPreviewsAction } from "@/actions/planning";
import {
  applyAiBulkSuggestionsAction,
  fetchBulkSlotPreviewsAction as fetchBulkAiSlotPreviewsAction,
  isAiPlanningAvailable,
} from "@/actions/ai-planning";
import { formatShiftLabel } from "@/lib/planning/shift-templates";
import { formatShortDate, parseDateKey } from "@/lib/planning/dates";
import { fr } from "@/lib/i18n/fr";
import type { AgentSuggestion, UnfilledSlotPreview } from "@/types/planning";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type SlotSuggestion = UnfilledSlotPreview & {
  suggestions: AgentSuggestion[];
};

type PlanningSuggestionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planningMonthId: string;
  unfilledSlots: UnfilledSlotPreview[];
  siteName?: string;
  onSelectSlot?: (slotId: string) => void;
};

const PREVIEW_LIMIT = 12;

function ReasonIcon({ type }: { type: "ok" | "warn" | "error" }) {
  if (type === "ok") return <CheckCircle2 className="size-3 text-emerald-600" />;
  if (type === "warn") return <AlertTriangle className="size-3 text-amber-500" />;
  return <XCircle className="size-3 text-red-500" />;
}

export function PlanningSuggestionsDialog({
  open,
  onOpenChange,
  planningMonthId,
  unfilledSlots,
  siteName,
  onSelectSlot,
}: PlanningSuggestionsDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SlotSuggestion[]>([]);
  const [useAi, setUseAi] = useState(true);
  const [aiAvailable, setAiAvailable] = useState(false);

  const fillableCount = items.filter((i) => i.suggestions.some((s) => s.accepted)).length;

  useEffect(() => {
    isAiPlanningAvailable().then(setAiAvailable);
  }, []);

  useEffect(() => {
    if (!open) {
      setItems([]);
      return;
    }

    const preview = unfilledSlots.slice(0, PREVIEW_LIMIT);
    setLoading(true);

    const fetchBulk = useAi ? fetchBulkAiSlotPreviewsAction : fetchBulkSlotPreviewsAction;

    fetchBulk(planningMonthId, preview)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [open, planningMonthId, unfilledSlots, useAi]);

  function handleBulkApply(useAiMode: boolean) {
    startTransition(async () => {
      const result = useAiMode
        ? await applyAiBulkSuggestionsAction(planningMonthId, unfilledSlots)
        : await applyBulkSuggestionsAction(planningMonthId, unfilledSlots);
      if (result.success) {
        const { applied, skipped } = result.data;
        toast.success(useAiMode ? fr.planning.aiApplyBulkSuccess : fr.planning.bulkFillSuccess, {
          description: `${applied} ${fr.planning.bulkFillApplied}, ${skipped} ${fr.planning.bulkFillSkipped}`,
        });
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5" />
            {siteName
              ? `${fr.planning.suggestionsDialogTitleSite} — ${siteName}`
              : fr.planning.suggestionsDialogTitle}
          </DialogTitle>
          <DialogDescription>
            {useAi ? fr.planning.aiSuggestionsDesc : null}{" "}
            {siteName
              ? `${fr.planning.suggestionsDialogDesc} (${unfilledSlots.length} poste${unfilledSlots.length > 1 ? "s" : ""} sur ce site)`
              : fr.planning.suggestionsDialogDesc}
          </DialogDescription>
        </DialogHeader>

        {aiAvailable && (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={useAi ? "default" : "outline"}
              className="gap-1"
              onClick={() => setUseAi(true)}
            >
              <Sparkles className="size-3.5" />
              {fr.planning.aiSuggestions}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={!useAi ? "default" : "outline"}
              onClick={() => setUseAi(false)}
            >
              {fr.planning.generateSuggestions}
            </Button>
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {useAi ? fr.planning.aiSuggestionsLoading : fr.planning.loadingSuggestions}
          </p>
        ) : unfilledSlots.length === 0 ? (
          <p className="py-8 text-center text-sm text-emerald-700 dark:text-emerald-400">
            {fr.planning.noUnfilledSlots}
          </p>
        ) : (
          <ul className="space-y-4">
            {items.map((item) => {
              const top = item.suggestions[0];
              const displayDate = formatShortDate(parseDateKey(item.date));

              return (
                <li key={item.slotId} className="rounded-lg border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <SiteLabel name={item.siteName} />
                    <span className="text-sm text-muted-foreground">
                      {displayDate} · {formatShiftLabel(item.startTime, item.endTime)}
                    </span>
                    <Badge variant="outline" className="font-normal">
                      {fr.planning.slotToCover}
                    </Badge>
                  </div>

                  {top ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        1. {top.agentName}{" "}
                        <Badge variant={top.accepted ? "secondary" : "destructive"}>
                          {top.score}%
                        </Badge>
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {(top.reasonDetails.length > 0
                          ? top.reasonDetails
                          : top.reasons.map((r) => ({
                              text: r,
                              type: (top.accepted ? "ok" : "error") as "ok" | "warn" | "error",
                            }))
                        ).map((r) => (
                          <span
                            key={r.text}
                            className={cn(
                              "inline-flex items-center gap-1 text-[11px]",
                              r.type === "error" && "text-red-600",
                              r.type === "warn" && "text-amber-600",
                              r.type === "ok" && "text-muted-foreground"
                            )}
                          >
                            <ReasonIcon type={r.type} />
                            {r.text}
                          </span>
                        ))}
                      </div>
                      {item.suggestions[1] && (
                        <p className="text-xs text-muted-foreground">
                          2. {item.suggestions[1].agentName} ({item.suggestions[1].score}%)
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{fr.planning.rejected}</p>
                  )}

                  {onSelectSlot && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSlot(item.slotId);
                        onOpenChange(false);
                      }}
                      className="mt-2 text-xs font-medium text-primary hover:underline"
                    >
                      {fr.planning.chooseAgent} →
                    </button>
                  )}
                </li>
              );
            })}
            {unfilledSlots.length > PREVIEW_LIMIT && (
              <p className="text-center text-xs text-muted-foreground">
                +{unfilledSlots.length - PREVIEW_LIMIT} {fr.planning.summaryMissing.toLowerCase()}
              </p>
            )}
          </ul>
        )}

        {unfilledSlots.length > 0 && !loading && (
          <DialogFooter className="gap-2 sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {fillableCount > 0
                ? `${fillableCount} ${fr.planning.bulkFillPreviewHint}`
                : fr.planning.bulkFillNoCandidates}
            </p>
            <Button onClick={() => handleBulkApply(false)} disabled={pending || unfilledSlots.length === 0} variant="outline">
              {pending && !useAi ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {fr.planning.bulkFillRunning}
                </>
              ) : (
                fr.planning.bulkFillApply
              )}
            </Button>
            {aiAvailable && (
              <Button onClick={() => handleBulkApply(true)} disabled={pending || unfilledSlots.length === 0}>
                {pending && useAi ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {fr.planning.aiApplyBulkRunning}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 size-4" />
                    {fr.planning.aiApplyBulk} ({unfilledSlots.length})
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
