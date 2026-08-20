"use client";

import { useEffect } from "react";
import { fr } from "@/lib/i18n/fr";

type PlanningPrintTriggerProps = {
  autoPrint?: boolean;
};

export function PlanningPrintTrigger({ autoPrint = true }: PlanningPrintTriggerProps) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="print-actions no-print">
      <button type="button" className="print-action-btn" onClick={() => window.print()}>
        {autoPrint ? fr.planning.printNow : fr.planning.printAnyway}
      </button>
      {!autoPrint && <p className="print-action-hint">{fr.planning.exportBlockedPrintHint}</p>}
    </div>
  );
}
