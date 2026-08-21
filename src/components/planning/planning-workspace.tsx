"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlanningToolbar } from "@/components/planning/planning-toolbar";
import { PlanningSummaryBar } from "@/components/planning/planning-summary-bar";
import { PlanningSuggestionsDialog } from "@/components/planning/planning-suggestions-dialog";
import { SitePlanningView } from "@/components/planning/site-planning-view";
import { AgentPlanningView } from "@/components/planning/agent-planning-view";
import { AssignmentDialog } from "@/components/planning/assignment-dialog";
import { PlanningDndProvider } from "@/components/planning/planning-dnd-provider";
import type {
  PlanningAssignmentDto,
  PlanningData,
  PlanningSlotDto,
} from "@/types/planning";
import { fr } from "@/lib/i18n/fr";
import { moveAssignmentToSlot } from "@/actions/planning";

type PlanningWorkspaceProps = PlanningData & {
  view: "site" | "agent";
};

export function PlanningWorkspace({
  view,
  planningMonth,
  days,
  sites,
  agents,
  assignments,
  agentOptions,
  siteOptions,
  summary,
  unfilledSlots,
}: PlanningWorkspaceProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsSite, setSuggestionsSite] = useState<{
    siteId?: string;
    siteName?: string;
  } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<PlanningSlotDto | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<PlanningAssignmentDto | null>(
    null
  );

  const slotIndex = useMemo(() => {
    const map = new Map<string, PlanningSlotDto>();
    for (const site of sites) {
      for (const row of site.shiftRows) {
        for (const daySlots of Object.values(row.slotsByDate)) {
          for (const slot of daySlots) {
            map.set(slot.id, slot);
          }
        }
      }
    }
    return map;
  }, [sites]);

  const siteNameMap = useMemo(
    () => new Map(siteOptions.map((s) => [s.id, s.name])),
    [siteOptions]
  );
  const missingBySite = useMemo(() => {
    const map = new Map<string, number>();
    for (const slot of unfilledSlots) {
      map.set(slot.siteId, (map.get(slot.siteId) ?? 0) + 1);
    }
    return map;
  }, [unfilledSlots]);

  const activeUnfilledSlots = useMemo(() => {
    if (!suggestionsSite?.siteId) return unfilledSlots;
    return unfilledSlots.filter((s) => s.siteId === suggestionsSite.siteId);
  }, [unfilledSlots, suggestionsSite?.siteId]);

  function openSuggestions(siteId?: string, siteName?: string) {
    setSuggestionsSite(siteId ? { siteId, siteName } : null);
    setSuggestionsOpen(true);
  }

  function handleSuggestionsOpenChange(open: boolean) {
    setSuggestionsOpen(open);
    if (!open) setSuggestionsSite(null);
  }

  function openSlot(slot: PlanningSlotDto) {
    setSelectedSlot(slot);
    setSelectedAssignment(slot.assignment);
    setDialogOpen(true);
  }

  function openAssignment(assignmentId: string) {
    const assignment = assignments.find((a) => a.id === assignmentId) ?? null;
    setSelectedAssignment(assignment);
    setSelectedSlot(null);
    setDialogOpen(true);
  }

  function handleDialogClose(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setSelectedSlot(null);
      setSelectedAssignment(null);
    }
  }

  function handleSelectSlotFromSuggestions(slotId: string) {
    const slot = slotIndex.get(slotId);
    if (slot) openSlot(slot);
  }

  function handleDrop(
    assignment: PlanningAssignmentDto,
    targetSlot: PlanningSlotDto
  ) {
    if (targetSlot.assignment && targetSlot.assignment.id !== assignment.id) {
      toast.error(fr.planning.dropOccupied);
      return;
    }

    if (
      assignment.siteId === targetSlot.siteId &&
      assignment.date === targetSlot.date &&
      assignment.startTime === targetSlot.startTime &&
      assignment.endTime === targetSlot.endTime
    ) {
      return;
    }

    startTransition(async () => {
      const result = await moveAssignmentToSlot(assignment.id, {
        siteId: targetSlot.siteId,
        date: targetSlot.date,
        shiftType: targetSlot.shiftType,
        startTime: targetSlot.startTime,
        endTime: targetSlot.endTime,
        planningMonthId: planningMonth.id,
        requirementId: targetSlot.requirementId,
        role: targetSlot.role,
      });

      if (result.success) {
        toast.success(fr.planning.assignmentMoved);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const dialogSiteName =
    selectedAssignment?.siteName ??
    (selectedSlot ? siteNameMap.get(selectedSlot.siteId) ?? "" : "");

  return (
    <div className="space-y-6">
      <PlanningToolbar
        year={planningMonth.year}
        month={planningMonth.month}
        planningMonthId={planningMonth.id}
        view={view}
        missingCount={summary.missingSlots}
        showAllSitesSuggestions={view === "agent"}
        onOpenSuggestions={() => openSuggestions()}
      />

      <PlanningSummaryBar summary={summary} />

      <PlanningDndProvider onDrop={handleDrop}>
        {view === "site" ? (
          <SitePlanningView
            sites={sites}
            days={days}
            year={planningMonth.year}
            month={planningMonth.month}
            planningMonthId={planningMonth.id}
            missingBySite={missingBySite}
            onSlotClick={openSlot}
            onOpenSiteSuggestions={(siteId, siteName) => openSuggestions(siteId, siteName)}
          />
        ) : (
          <AgentPlanningView
            agents={agents}
            days={days}
            onAssignmentClick={openAssignment}
          />
        )}
      </PlanningDndProvider>

      <p className="text-center text-xs text-muted-foreground">
        {pending ? fr.planning.movingAssignment : fr.planning.dragHintActive}
      </p>

      <AssignmentDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        planningMonthId={planningMonth.id}
        slot={selectedSlot}
        assignment={selectedAssignment}
        siteName={dialogSiteName}
        agentOptions={agentOptions}
      />

      <PlanningSuggestionsDialog
        open={suggestionsOpen}
        onOpenChange={handleSuggestionsOpenChange}
        planningMonthId={planningMonth.id}
        unfilledSlots={activeUnfilledSlots}
        siteName={suggestionsSite?.siteName}
        onSelectSlot={handleSelectSlotFromSuggestions}
      />
    </div>
  );
}
