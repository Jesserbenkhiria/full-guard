import { formatDayOfMonth, formatShortWeekday } from "@/lib/planning/dates";
import { computeSiteCoverage } from "@/lib/planning/summary";
import { formatShiftLabel } from "@/lib/planning/shift-templates";
import { getSiteColorStyle } from "@/lib/site-colors";
import {
  SHIFT_TYPE_LABELS,
  POSITION_ROLE_LABELS,
  formatAgentsRequired,
} from "@/lib/constants";
import { fr } from "@/lib/i18n/fr";
import type { SitePlanningGroup } from "@/types/planning";

function sortShiftRows(site: SitePlanningGroup) {
  return [...site.shiftRows]
    .filter((row) =>
      Object.values(row.slotsByDate).some((slots) => slots.length > 0)
    )
    .sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.role !== b.role) return a.role === "TEAM_LEADER" ? -1 : 1;
      return a.label.localeCompare(b.label, "fr");
    });
}

export function buildSitePrintUrl(year: number, month: number, siteId: string) {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
    view: "site",
    siteId,
  });
  return `/planning/print?${params.toString()}`;
}

type SitePrintCalendarProps = {
  site: SitePlanningGroup;
  days: string[];
  /** Single-site print: show full header + stats */
  standalone?: boolean;
};

export function SitePrintCalendar({ site, days, standalone = false }: SitePrintCalendarProps) {
  const rows = sortShiftRows(site).filter((row) =>
    days.some((d) => (row.slotsByDate[d]?.length ?? 0) > 0)
  );

  if (rows.length === 0) return null;

  const siteStyle = getSiteColorStyle(site.siteName);
  const coverage = computeSiteCoverage(site);

  return (
    <section className={standalone ? "site-print-standalone" : undefined}>
      {standalone ? (
        <header className="site-print-header">
          <h2>{site.siteName}</h2>
          <p className="site-print-subtitle">{siteStyle.shortLabel}</p>
          <div className="site-print-stats">
            <span>
              {fr.planning.summaryFilled}: <strong>{coverage.filled}</strong> / {coverage.total}
            </span>
            {coverage.missing > 0 && (
              <span className="site-print-missing">
                {fr.planning.summaryMissing}: <strong>{coverage.missing}</strong>
              </span>
            )}
          </div>
        </header>
      ) : (
        <h2>{siteStyle.shortLabel}</h2>
      )}

      <table>
        <thead>
          <tr>
            <th className="agent-col">{fr.planning.shiftColumn}</th>
            {days.map((day) => (
              <th key={day}>
                <span className="print-weekday">{formatShortWeekday(day)}</span>
                <span className="print-daynum">{formatDayOfMonth(day)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.requirementId}>
              <td className="agent-col">
                <strong>{formatShiftLabel(row.startTime, row.endTime)}</strong>
                <br />
                <small>
                  {SHIFT_TYPE_LABELS[row.shiftType]} · {POSITION_ROLE_LABELS[row.role]}
                </small>
                <br />
                <small>{row.label}</small>
              </td>
              {days.map((day) => {
                const slots = row.slotsByDate[day] ?? [];
                if (slots.length === 0) {
                  return <td key={day} className="print-empty-day" />;
                }
                const required = slots[0]?.requiredAgents ?? slots.length;
                const filled = slots.filter((s) => s.assignment).length;
                return (
                  <td key={day}>
                    <div className="print-slot-header">
                      {formatAgentsRequired(required)} ({filled}/{required})
                    </div>
                    {slots.map((slot) => {
                      const a = slot.assignment;
                      const cls = !a
                        ? "empty"
                        : a.validationStatus === "error"
                          ? "error"
                          : a.validationStatus === "warning"
                            ? "warning"
                            : "filled";
                      return (
                        <div key={slot.id} className={`print-slot ${cls}`}>
                          {a ? (
                            <>
                              <strong>{a.agentName}</strong>
                              <br />
                              <small>
                                {formatShiftLabel(a.startTime, a.endTime)}
                              </small>
                            </>
                          ) : (
                            `#${slot.slotIndex + 1} — ${fr.planning.unassignedSlot}`
                          )}
                        </div>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export const PLANNING_PRINT_STYLES = `
  @page { size: A4 landscape; margin: 10mm; }
  .planning-print { font-size: 9px; color: #111; }
  .planning-print h1 { font-size: 16px; margin: 0 0 4px; }
  .planning-print .meta { color: #555; margin-bottom: 12px; font-size: 11px; }
  .planning-print .summary { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; font-size: 11px; }
  .planning-print .summary span { font-weight: 600; }
  .planning-print section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 20px; }
  .planning-print section.site-print-standalone { page-break-before: auto; }
  .planning-print h2 { font-size: 12px; margin: 0 0 8px; text-transform: uppercase; }
  .planning-print .site-print-header { margin-bottom: 12px; border-bottom: 2px solid #333; padding-bottom: 8px; }
  .planning-print .site-print-header h2 { font-size: 14px; text-transform: none; margin: 0; }
  .planning-print .site-print-subtitle { color: #666; font-size: 10px; margin: 2px 0 6px; }
  .planning-print .site-print-stats { display: flex; gap: 16px; font-size: 10px; }
  .planning-print .site-print-missing { color: #b45309; }
  .planning-print table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
  .planning-print th, .planning-print td { border: 1px solid #ccc; padding: 2px 3px; text-align: center; vertical-align: top; }
  .planning-print th { background: #f3f3f3; font-weight: 600; }
  .planning-print .print-weekday { display: block; font-size: 8px; text-transform: uppercase; color: #666; }
  .planning-print .print-daynum { display: block; font-size: 10px; font-weight: 700; }
  .planning-print .agent-col { text-align: left; width: 110px; font-weight: 600; font-size: 8px; }
  .planning-print .print-empty-day { background: #fafafa; }
  .planning-print .print-slot-header { font-weight: 600; font-size: 8px; margin-bottom: 3px; padding-bottom: 2px; border-bottom: 1px solid #e5e5e5; }
  .planning-print .print-slot { margin-bottom: 2px; padding: 2px; font-size: 8px; line-height: 1.25; }
  .planning-print .filled { background: #ecfdf5; }
  .planning-print .empty { background: #fffbeb; color: #92400e; }
  .planning-print .error { background: #fef2f2; color: #991b1b; }
  .planning-print .warning { background: #fffbeb; color: #92400e; }
  .planning-print .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .planning-print .legend-item { display: flex; align-items: center; gap: 4px; font-size: 9px; }
  .planning-print .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .planning-print .print-blocked-banner {
    background: #fef2f2;
    border: 2px solid #dc2626;
    color: #991b1b;
    padding: 12px 16px;
    margin-bottom: 16px;
    border-radius: 4px;
    font-size: 11px;
  }
  .planning-print .print-blocked-banner h3 { margin: 0 0 8px; font-size: 13px; }
  .planning-print .print-blocked-banner ul { margin: 0; padding-left: 18px; }
  .planning-print .print-blocked-banner li { margin-bottom: 4px; }
  .planning-print .print-actions { margin-bottom: 16px; }
  .planning-print .print-action-btn {
    background: #111;
    color: #fff;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }
  .planning-print .print-action-hint { margin: 8px 0 0; font-size: 11px; color: #666; }
  @media print {
    .planning-print .no-print,
    .planning-print .print-blocked-banner { display: none !important; }
    .planning-print section + section { page-break-before: always; }
    .planning-print section.site-print-standalone { page-break-before: auto; }
  }
`;
