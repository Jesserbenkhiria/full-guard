import { formatDayOfMonth, formatShortWeekday } from "@/lib/planning/dates";
import { weekendPrintClass } from "@/lib/planning/weekend-style";
import { PrintAgentName, splitAgentNameForPrint } from "@/lib/planning/print-format";
import { computeSiteCoverage, collectSiteAgentHours } from "@/lib/planning/summary";
import { formatShiftLabel, mergeShiftRowsByHours } from "@/lib/planning/shift-templates";
import { getSiteColorStyle } from "@/lib/site-colors";
import {
  SHIFT_TYPE_LABELS,
  POSITION_ROLE_LABELS,
} from "@/lib/constants";
import { fr } from "@/lib/i18n/fr";
import type { SitePlanningGroup } from "@/types/planning";

function formatPrintHours(hours: number): string {
  return `${hours.toLocaleString("fr-FR")} h`;
}

function sortShiftRows(site: SitePlanningGroup) {
  return mergeShiftRowsByHours(site.shiftRows)
    .filter((row) =>
      Object.values(row.slotsByDate).some((slots) => slots.length > 0)
    )
    .sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.endTime !== b.endTime) return a.endTime.localeCompare(b.endTime);
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
  const agentHours = collectSiteAgentHours(site);

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
            <th className="shift-col">{fr.planning.shiftColumn}</th>
            {days.map((day) => {
              const weekend = weekendPrintClass(day);
              return (
                <th key={day} className={weekend}>
                  <span className="print-weekday">{formatShortWeekday(day)}</span>
                  <span className="print-daynum">{formatDayOfMonth(day)}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isTeamLeader = row.role === "TEAM_LEADER";

            return (
              <tr key={row.requirementId} className={isTeamLeader ? "print-tl-row" : undefined}>
                <td className="shift-col">
                  <div className="print-shift-label">
                    <strong>{formatShiftLabel(row.startTime, row.endTime)}</strong>
                    <span className="print-shift-meta">
                      {SHIFT_TYPE_LABELS[row.shiftType]}
                      {isTeamLeader ? ` · ${POSITION_ROLE_LABELS.TEAM_LEADER}` : ""}
                    </span>
                  </div>
                </td>
                {days.map((day) => {
                  const slots = row.slotsByDate[day] ?? [];
                  const weekend = weekendPrintClass(day);

                  if (slots.length === 0) {
                    return (
                      <td key={day} className={`print-empty-day${weekend ? ` ${weekend}` : ""}`} />
                    );
                  }

                  return (
                    <td key={day} className={weekend}>
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
                              <PrintAgentName agentName={a.agentName} />
                            ) : (
                              <span className="print-unassigned">—</span>
                            )}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {agentHours.length > 0 ? (
        <footer className="print-agent-totals">
          <h3>{fr.planning.printAgentHours}</h3>
          <ul>
            {agentHours.map((agent) => {
              const { lastName, firstName } = splitAgentNameForPrint(agent.agentName);
              return (
                <li key={agent.agentId}>
                  <span className="print-agent-last">
                    {lastName}
                    {firstName ? ` ${firstName}` : ""}
                  </span>
                  <strong>{formatPrintHours(agent.hours)}</strong>
                  <span className="print-agent-meta">
                    {agent.vacations} {fr.planning.printVacationsShort}
                  </span>
                  <span className="print-agent-meta">
                    {agent.weekends} {fr.planning.printWeekendsShort}
                  </span>
                </li>
              );
            })}
          </ul>
        </footer>
      ) : null}
    </section>
  );
}

export const PLANNING_PRINT_STYLES = `
  @page { size: A4 landscape; margin: 8mm; }
  .planning-print {
    font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    font-size: 10px;
    color: #111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .planning-print h1 {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.02em;
    margin: 0 0 4px;
  }
  .planning-print .meta { color: #555; margin-bottom: 14px; font-size: 11px; }
  .planning-print .summary { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; font-size: 11px; }
  .planning-print .summary span { font-weight: 600; }
  .planning-print section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 22px; }
  .planning-print section.site-print-standalone { page-break-before: auto; }
  .planning-print h2 { font-size: 13px; font-weight: 700; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  .planning-print .site-print-header { margin-bottom: 14px; border-bottom: 2px solid #222; padding-bottom: 10px; }
  .planning-print .site-print-header h2 { font-size: 16px; text-transform: none; letter-spacing: 0; margin: 0; }
  .planning-print .site-print-subtitle { color: #666; font-size: 11px; margin: 3px 0 8px; }
  .planning-print .site-print-stats { display: flex; gap: 18px; font-size: 11px; }
  .planning-print .site-print-missing { color: #b45309; font-weight: 600; }
  .planning-print table { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }
  .planning-print th,
  .planning-print td {
    border: 1px solid #bbb;
    padding: 4px 3px;
    text-align: center;
    vertical-align: middle;
  }
  .planning-print th {
    background: #ececec;
    font-weight: 700;
    padding: 5px 2px;
  }
  .planning-print .print-weekday {
    display: block;
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #666;
    line-height: 1.2;
  }
  .planning-print .print-daynum {
    display: block;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    margin-top: 1px;
  }
  .planning-print .print-weekend-sat {
    background: #e0f2fe;
  }
  .planning-print th.print-weekend-sat {
    background: #7dd3fc;
    color: #0c4a6e;
  }
  .planning-print th.print-weekend-sat .print-weekday {
    color: #075985;
    font-weight: 700;
  }
  .planning-print .print-weekend-sun {
    background: #ede9fe;
  }
  .planning-print th.print-weekend-sun {
    background: #c4b5fd;
    color: #4c1d95;
  }
  .planning-print th.print-weekend-sun .print-weekday {
    color: #5b21b6;
    font-weight: 700;
  }
  .planning-print .print-empty-day.print-weekend-sat {
    background: #e0f2fe;
  }
  .planning-print .print-empty-day.print-weekend-sun {
    background: #ede9fe;
  }
  .planning-print .shift-col {
    text-align: left;
    width: 92px;
    min-width: 92px;
    max-width: 92px;
    padding: 5px 6px;
    background: #fafafa;
    vertical-align: middle;
  }
  .planning-print .print-shift-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.2;
  }
  .planning-print .print-shift-label strong {
    font-size: 9px;
    font-weight: 700;
    white-space: nowrap;
  }
  .planning-print .print-shift-meta {
    font-size: 7px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .planning-print .print-tl-row .shift-col {
    background: #fffbeb;
    border-left: 3px solid #d97706;
  }
  .planning-print .print-empty-day {
    background: #fafafa;
  }
  .planning-print .print-slot {
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px 2px;
    border-radius: 3px;
    margin-bottom: 2px;
  }
  .planning-print .print-slot:last-child { margin-bottom: 0; }
  .planning-print .print-agent-name {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    width: 100%;
    min-width: 0;
  }
  .planning-print .print-agent-last {
    display: block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.03em;
    line-height: 1.15;
    text-transform: uppercase;
    word-break: break-word;
    overflow-wrap: anywhere;
    hyphens: auto;
    max-width: 100%;
    color: #111;
  }
  .planning-print .print-agent-first {
    display: block;
    font-size: 8px;
    font-weight: 500;
    line-height: 1.1;
    color: #444;
    word-break: break-word;
    overflow-wrap: anywhere;
    max-width: 100%;
  }
  .planning-print .print-unassigned {
    font-size: 12px;
    color: #bbb;
    font-weight: 300;
  }
  .planning-print .print-agent-totals {
    margin-top: 10px;
    border-top: 1.5px solid #222;
    padding-top: 8px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .planning-print .print-agent-totals h3 {
    margin: 0 0 6px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .planning-print .print-agent-totals ul {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .planning-print .print-agent-totals li {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 220px;
  }
  .planning-print .print-agent-totals .print-agent-last {
    font-size: 10px;
    text-transform: uppercase;
  }
  .planning-print .print-agent-totals strong {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .planning-print .print-agent-totals .print-agent-meta {
    font-size: 10px;
    color: #444;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .planning-print .filled { background: #ecfdf5; }
  .planning-print td.filled.print-weekend-sat { background: #dbeafe; }
  .planning-print td.filled.print-weekend-sun { background: #ddd6fe; }
  .planning-print td.error.print-weekend-sat,
  .planning-print td.error.print-weekend-sun { background: #fef2f2; }
  .planning-print td.warning.print-weekend-sat,
  .planning-print td.warning.print-weekend-sun { background: #fffbeb; }
  .planning-print .empty { background: #fffbeb; }
  .planning-print .error { background: #fef2f2; }
  .planning-print .error .print-agent-last { color: #991b1b; }
  .planning-print .warning { background: #fffbeb; }
  .planning-print .warning .print-agent-last { color: #92400e; }
  .planning-print .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
  .planning-print .legend-item { display: flex; align-items: center; gap: 5px; font-size: 10px; }
  .planning-print .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
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
  .planning-print .agent-col {
    text-align: left;
    width: 120px;
    font-weight: 600;
    font-size: 10px;
    padding: 6px 8px;
    background: #fafafa;
    vertical-align: middle;
  }
  .planning-print .agent-col-name {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .planning-print .agent-col-hours {
    font-size: 8px;
    color: #666;
    font-weight: 500;
  }
  @media print {
    .planning-print .no-print,
    .planning-print .print-blocked-banner { display: none !important; }
    .planning-print section + section { page-break-before: always; }
    .planning-print section.site-print-standalone { page-break-before: auto; }
    .planning-print .print-agent-last { font-size: 8.5px; }
    .planning-print .print-agent-first { font-size: 7.5px; }
  }
`;
