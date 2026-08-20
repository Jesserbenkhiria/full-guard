"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  createAssignment,
  deleteAssignment,
  fetchAgentSuggestions,
  updateAssignment,
} from "@/actions/planning";
import { fetchAiAgentSuggestions, isAiPlanningAvailable } from "@/actions/ai-planning";
import { formatShiftLabel } from "@/lib/planning/shift-templates";
import { formatShortDate, parseDateKey } from "@/lib/planning/dates";
import { SHIFT_TYPE_LABELS, POSITION_ROLE_LABELS, formatAgentsRequired } from "@/lib/constants";
import { fr } from "@/lib/i18n/fr";
import type { AgentSuggestion, PlanningAssignmentDto, PlanningSlotDto, SuggestionReasonDetail } from "@/types/planning";
import { CheckCircle2, XCircle, AlertTriangle, Sparkles } from "lucide-react";

function formatRemainingHours(s: AgentSuggestion): string | null {
  if (s.remainingHours == null || s.contractHours == null) return null;
  return `${s.remainingHours}h ${fr.planning.remainingHoursShort} / ${s.contractHours}h`;
}

function SuggestionReasonLine({ detail }: { detail: SuggestionReasonDetail }) {
  const Icon =
    detail.type === "ok" ? CheckCircle2 : detail.type === "warn" ? AlertTriangle : XCircle;
  const color =
    detail.type === "ok"
      ? "text-emerald-600"
      : detail.type === "warn"
        ? "text-amber-600"
        : "text-red-600";

  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] ${color}`}>
      <Icon className="size-3 shrink-0" />
      {detail.text}
    </span>
  );
}

type AssignmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planningMonthId: string;
  slot: PlanningSlotDto | null;
  assignment: PlanningAssignmentDto | null;
  siteName: string;
  agentOptions: { id: string; name: string }[];
};

export function AssignmentDialog({
  open,
  onOpenChange,
  planningMonthId,
  slot,
  assignment,
  siteName,
  agentOptions,
}: AssignmentDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [notes, setNotes] = useState("");
  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [selectedAiSuggestion, setSelectedAiSuggestion] = useState<AgentSuggestion | null>(null);

  const isEdit = Boolean(assignment);
  const context = assignment ?? slot;

  useEffect(() => {
    isAiPlanningAvailable().then(setAiAvailable);
  }, []);

  useEffect(() => {
    if (!open || !context) return;
    setAgentId(assignment?.agentId ?? "");
    setNotes(assignment?.notes ?? "");
  }, [open, assignment, context]);

  useEffect(() => {
    if (!open || !context) {
      setSuggestions([]);
      return;
    }

    setLoadingSuggestions(true);
    const input = {
      planningMonthId,
      siteId: context.siteId,
      date: assignment?.date ?? slot!.date,
      shiftType: context.shiftType,
      startTime: context.startTime,
      endTime: context.endTime,
      role: slot?.role ?? assignment?.role,
      excludeAssignmentId: assignment?.id,
    };

    const loader = useAi ? fetchAiAgentSuggestions(input) : fetchAgentSuggestions(input);
    loader
      .then(setSuggestions)
      .finally(() => setLoadingSuggestions(false));
  }, [open, context, assignment, slot, planningMonthId, useAi]);

  const selectedSuggestion = suggestions.find((s) => s.agentId === agentId);
  const selectedRemaining = selectedSuggestion ? formatRemainingHours(selectedSuggestion) : null;

  if (!context) return null;

  const dateStr = assignment?.date ?? slot!.date;
  const displayDate = formatShortDate(parseDateKey(dateStr));

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.set("planningMonthId", planningMonthId);
    fd.set("agentId", agentId);
    fd.set("siteId", context!.siteId);
    fd.set("date", dateStr);
    fd.set("shiftType", context!.shiftType);
    fd.set("startTime", context!.startTime);
    fd.set("endTime", context!.endTime);
    if (slot?.requirementId) fd.set("requirementId", slot.requirementId);
    if (slot?.role) fd.set("role", slot.role);
    else if (assignment?.role) fd.set("role", assignment.role);
    if (notes) fd.set("notes", notes);
    if (selectedAiSuggestion?.aiGenerated) {
      fd.set("aiGenerated", "true");
      if (selectedAiSuggestion.aiConfidence != null) {
        fd.set("aiConfidence", String(selectedAiSuggestion.aiConfidence));
      }
      if (selectedAiSuggestion.aiExplanation) {
        fd.set("aiExplanation", selectedAiSuggestion.aiExplanation);
      }
    }
    return fd;
  }

  function handleSave() {
    if (!agentId) {
      toast.error(fr.planning.selectAgent);
      return;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateAssignment(assignment!.id, buildFormData())
        : await createAssignment(buildFormData());

      if (result.success) {
        toast.success(isEdit ? fr.planning.assignmentUpdated : fr.planning.assignmentCreated);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete() {
    if (!assignment) return;
    startTransition(async () => {
      const result = await deleteAssignment(assignment.id);
      if (result.success) {
        toast.success(fr.planning.assignmentDeleted);
        setDeleteOpen(false);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function selectSuggestion(s: AgentSuggestion) {
    if (s.accepted) {
      setAgentId(s.agentId);
      setSelectedAiSuggestion(s.aiGenerated ? s : null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? fr.planning.editAssignment : fr.planning.addAssignment}
            </DialogTitle>
            <DialogDescription>
              {siteName} — {displayDate}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{fr.planning.need}</p>
              <p>{siteName}</p>
              <p>{displayDate}</p>
              <p>
                {formatShiftLabel(context.startTime, context.endTime)} (
                {SHIFT_TYPE_LABELS[context.shiftType]})
              </p>
              {(slot?.role ?? assignment?.role) && (
                <p className="text-muted-foreground">
                  {POSITION_ROLE_LABELS[slot?.role ?? assignment!.role]}
                </p>
              )}
              {slot && (
                <p className="text-muted-foreground">
                  {formatAgentsRequired(slot.requiredAgents)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>{useAi ? fr.planning.aiSuggestions : fr.planning.recommendedAgents}</Label>
                {aiAvailable && (
                  <Button
                    type="button"
                    variant={useAi ? "default" : "outline"}
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setUseAi((v) => !v)}
                  >
                    <Sparkles className="size-3" />
                    {fr.planning.aiSuggestions}
                  </Button>
                )}
              </div>
              {useAi && (
                <p className="text-[11px] text-muted-foreground">{fr.planning.aiSuggestionsDesc}</p>
              )}
              {loadingSuggestions ? (
                <p className="text-sm text-muted-foreground">
                  {useAi ? fr.planning.aiSuggestionsLoading : fr.common.saving}
                </p>
              ) : suggestions.filter((s) => s.accepted).length === 0 ? (
                <p className="text-sm text-muted-foreground">{fr.planning.noValidatedAgents}</p>
              ) : (
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {suggestions.filter((s) => s.accepted).slice(0, 6).map((s, i) => (
                    <li key={s.agentId}>
                      <button
                        type="button"
                        disabled={!s.accepted}
                        onClick={() => selectSuggestion(s)}
                        className="flex w-full items-start gap-2 rounded-md border p-2 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
                      >
                        <span className="font-medium text-muted-foreground">{i + 1}.</span>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{s.agentName}</span>
                            <Badge variant={s.accepted ? "secondary" : "destructive"}>
                              {s.score}%
                            </Badge>
                            {s.aiGenerated && (
                              <Badge variant="outline" className="gap-0.5 text-[10px]">
                                <Sparkles className="size-2.5" />
                                IA
                              </Badge>
                            )}
                            {i === 0 && s.accepted && (
                              <span className="text-[10px] font-medium text-emerald-600">
                                {fr.planning.aiRecommended}
                              </span>
                            )}
                            {i === 1 && s.accepted && (
                              <span className="text-[10px] text-muted-foreground">
                                {fr.planning.aiAlternative}
                              </span>
                            )}
                            {formatRemainingHours(s) && (
                              <span className="text-[10px] font-medium text-sky-700 dark:text-sky-400">
                                {formatRemainingHours(s)}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                            {(s.reasonDetails.length > 0
                              ? s.reasonDetails
                              : s.reasons.map((r) => ({
                                  text: r,
                                  type: (s.accepted ? "ok" : "error") as SuggestionReasonDetail["type"],
                                }))
                            ).map((r) => (
                              <SuggestionReasonLine key={r.text} detail={r} />
                            ))}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent">{fr.planning.agent}</Label>
              <Select
                value={agentId}
                onValueChange={(value) => setAgentId(value ?? "")}
              >
                <SelectTrigger id="agent">
                  <SelectValue placeholder={fr.planning.selectAgent} />
                </SelectTrigger>
                <SelectContent>
                  {agentOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRemaining && (
                <p className="text-xs text-sky-700 dark:text-sky-400">
                  {fr.planning.remainingHours}: {selectedRemaining}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{fr.planning.notes}</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {assignment?.aiExplanation && (
              <div className="space-y-1 rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/20">
                <p className="text-xs font-medium text-violet-800 dark:text-violet-300">
                  {fr.planning.aiExplanation}
                </p>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {assignment.aiExplanation}
                </p>
              </div>
            )}

            {assignment && assignment.alerts.length > 0 && (
              <div className="space-y-1 rounded-lg border p-3">
                {assignment.alerts.map((alert) => (
                  <p
                    key={alert.id}
                    className={`text-xs ${
                      alert.severity === "ERROR"
                        ? "text-red-600"
                        : alert.severity === "WARNING"
                          ? "text-amber-600"
                          : "text-emerald-600"
                    }`}
                  >
                    {alert.message}
                  </p>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={pending}
              >
                {fr.common.delete}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                {fr.common.cancel}
              </Button>
              <Button onClick={handleSave} disabled={pending}>
                {pending ? fr.common.saving : fr.planning.save}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={fr.planning.deleteAssignment}
        description={fr.planning.deleteAssignmentDesc}
        onConfirm={handleDelete}
        loading={pending}
      />
    </>
  );
}
