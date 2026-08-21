import type { ShiftPlanningRow } from "@/types/planning";
import { fr } from "@/lib/i18n/fr";

export function getSlotRowLabel(
  row: ShiftPlanningRow,
  agentRow: number,
  days: string[],
  habitualAgents: string[],
  teamLeaderHints: string[] = []
): { label: string; isHabitual: boolean; isAssigned: boolean } {
  const assignedNames = days
    .map((d) => row.slotsByDate[d]?.[agentRow]?.assignment?.agentName)
    .filter(Boolean) as string[];

  if (assignedNames.length > 0) {
    const counts = new Map<string, number>();
    for (const name of assignedNames) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const [topName] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return { label: topName, isHabitual: false, isAssigned: true };
  }

  const hints = habitualAgents;

  const habitual = hints[agentRow] ?? habitualAgents[agentRow];
  if (habitual) {
    return { label: habitual, isHabitual: true, isAssigned: false };
  }

  return { label: fr.planning.openPosition, isHabitual: false, isAssigned: false };
}
