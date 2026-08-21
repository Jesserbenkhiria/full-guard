"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Loader2, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
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
import { applySingleSlotFillAction, finalizePlanningFillAction, isAiPlanningAvailable } from "@/actions/ai-planning";
import { compareSequentialSlotOrder } from "@/services/planning/constraint-priority";
import { formatShiftLabel } from "@/lib/planning/shift-templates";
import { formatShortDate, getDayOfWeek, parseDateKey } from "@/lib/planning/dates";
import { DAY_LABELS_FULL } from "@/lib/constants";
import { fr } from "@/lib/i18n/fr";
import type { UnfilledSlotPreview } from "@/types/planning";
import { cn } from "@/lib/utils";

type FillStepStatus =
  | "pending"
  | "running"
  | "applied"
  | "already_filled"
  | "no_candidate"
  | "failed"
  | "skipped";

type FillStep = {
  slot: UnfilledSlotPreview;
  status: FillStepStatus;
  agentName?: string;
  error?: string;
};

type PlanningSuggestionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planningMonthId: string;
  unfilledSlots: UnfilledSlotPreview[];
  siteName?: string;
  onSelectSlot?: (slotId: string) => void;
};

function StepIcon({ status }: { status: FillStepStatus }) {
  if (status === "running") return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
  if (status === "applied") return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />;
  if (status === "failed") return <XCircle className="size-4 shrink-0 text-red-500" />;
  if (status === "no_candidate") return <XCircle className="size-4 shrink-0 text-amber-500" />;
  if (status === "already_filled") return <MinusCircle className="size-4 shrink-0 text-muted-foreground" />;
  return <span className="size-4 shrink-0 rounded-full border border-muted-foreground/30" />;
}

function stepLabel(step: FillStep): string {
  switch (step.status) {
    case "running":
      return fr.planning.liveFillRunning;
    case "applied":
      return `${fr.planning.liveFillApplied}: ${step.agentName}`;
    case "already_filled":
      return fr.planning.liveFillAlreadyFilled;
    case "no_candidate":
      return fr.planning.liveFillNoCandidate;
    case "failed":
      return step.error ?? fr.planning.liveFillFailed;
    default:
      return fr.planning.liveFillPending;
  }
}

export function PlanningSuggestionsDialog({
  open,
  onOpenChange,
  planningMonthId,
  unfilledSlots,
  siteName,
}: PlanningSuggestionsDialogProps) {
  const router = useRouter();
  const [useAi, setUseAi] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [steps, setSteps] = useState<FillStep[]>([]);
  const cancelRef = useRef(false);

  const orderedSlots = useMemo(
    () => [...unfilledSlots].sort(compareSequentialSlotOrder),
    [unfilledSlots]
  );

  const appliedCount = steps.filter((s) => s.status === "applied").length;
  const progress = orderedSlots.length > 0 ? steps.filter((s) => s.status !== "pending").length : 0;

  useEffect(() => {
    isAiPlanningAvailable().then(setAiAvailable);
  }, []);

  const runLiveFill = useCallback(async () => {
    if (orderedSlots.length === 0) return;

    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    setSteps(orderedSlots.map((slot) => ({ slot, status: "pending" as const })));

    let applied = 0;
    let skipped = 0;

    for (let i = 0; i < orderedSlots.length; i++) {
      if (cancelRef.current) break;

      setSteps((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, status: "running" } : s))
      );

      const slot = orderedSlots[i];
      const result = await applySingleSlotFillAction(planningMonthId, slot, useAi);

      if (result.success) {
        const { status, agentName, error } = result.data;
        const stepStatus: FillStepStatus =
          status === "applied"
            ? "applied"
            : status === "already_filled"
              ? "already_filled"
              : status === "no_candidate"
                ? "no_candidate"
                : "failed";

        if (stepStatus === "applied") applied++;
        else skipped++;

        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: stepStatus, agentName, error } : s
          )
        );
      } else {
        skipped++;
        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: "failed", error: result.error } : s
          )
        );
      }
    }

    setRunning(false);
    setDone(true);
    await finalizePlanningFillAction();
    router.refresh();

    toast.success(fr.planning.liveFillComplete, {
      description: `${applied} ${fr.planning.bulkFillApplied}, ${skipped} ${fr.planning.bulkFillSkipped}`,
    });
  }, [orderedSlots, planningMonthId, useAi, router]);

  useEffect(() => {
    if (!open) {
      cancelRef.current = true;
      setSteps([]);
      setRunning(false);
      setDone(false);
      return;
    }

    if (orderedSlots.length === 0) return;

    cancelRef.current = false;
    void runLiveFill();

    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when dialog opens
  }, [open]);

  function handleClose() {
    cancelRef.current = true;
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5" />
            {siteName
              ? `${fr.planning.liveFillTitle} — ${siteName}`
              : fr.planning.liveFillTitle}
            <Badge variant="secondary" className="ml-1 text-[10px] font-normal">
              {useAi && aiAvailable ? fr.planning.aiSuggestions : fr.planning.generateSuggestions}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {useAi ? fr.planning.aiSuggestionsDesc : fr.planning.liveFillDesc}
            {orderedSlots.length > 0 && (
              <>
                {" "}
                · {orderedSlots.length} {fr.planning.slotsToFill}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {orderedSlots.length === 0 ? (
          <p className="py-8 text-center text-sm text-emerald-700 dark:text-emerald-400">
            {fr.planning.noUnfilledSlots}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {running
                    ? fr.planning.liveFillInProgress
                    : done
                      ? fr.planning.liveFillDone
                      : fr.planning.liveFillStarting}
                </span>
                <span>
                  {progress}/{orderedSlots.length}
                  {appliedCount > 0 && (
                    <span className="ml-2 text-emerald-600">
                      · {appliedCount} {fr.planning.bulkFillApplied}
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: `${orderedSlots.length ? (progress / orderedSlots.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {steps.map((step) => {
                const slotDate = parseDateKey(step.slot.date);
                const weekday = DAY_LABELS_FULL[getDayOfWeek(slotDate)];
                const displayDate = formatShortDate(slotDate);
                return (
                  <li
                    key={step.slot.slotId}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                      step.status === "running" && "border-primary/40 bg-primary/5",
                      step.status === "applied" && "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20",
                      step.status === "failed" && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
                    )}
                  >
                    <StepIcon status={step.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <SiteLabel name={step.slot.siteName} />
                        <span className="text-xs text-muted-foreground">
                          {weekday} {displayDate} · {formatShiftLabel(step.slot.startTime, step.slot.endTime)}
                        </span>
                        {step.slot.requiredAgents > 1 && (
                          <Badge variant="outline" className="h-5 text-[10px] font-normal">
                            #{step.slot.slotIndex + 1}/{step.slot.requiredAgents}
                          </Badge>
                        )}
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 text-xs",
                          step.status === "applied" && "font-medium text-emerald-800 dark:text-emerald-300",
                          step.status === "failed" && "text-red-600",
                          step.status === "no_candidate" && "text-amber-700",
                          step.status === "pending" && "text-muted-foreground",
                          step.status === "running" && "text-primary"
                        )}
                      >
                        {stepLabel(step)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={running && !done}>
            {done ? fr.common.close : fr.common.cancel}
          </Button>
          {done && (
            <Button onClick={() => { handleClose(); router.refresh(); }}>
              {fr.planning.liveFillViewPlanning}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
