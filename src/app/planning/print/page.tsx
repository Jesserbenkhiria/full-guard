import { formatMonthLabel } from "@/lib/planning/dates";
import { getSiteColorStyle } from "@/lib/site-colors";
import { getPlanningData } from "@/services/planning/queries";
import {
  PLANNING_PRINT_STYLES,
  SitePrintCalendar,
} from "@/components/planning/site-print-calendar";
import { PlanningPrintTrigger } from "@/components/planning/planning-print-trigger";
import { computeSiteExportCheck, computeMonthExportCheck } from "@/services/rules/export-check";
import { fr } from "@/lib/i18n/fr";
import type { PlanningData } from "@/types/planning";
import { SHIFT_TYPE_LABELS } from "@/lib/constants";

type PlanningPrintPageProps = {
  searchParams: Promise<{ year?: string; month?: string; view?: string; siteId?: string }>;
};

export default async function PlanningPrintPage({ searchParams }: PlanningPrintPageProps) {
  const params = await searchParams;
  const year = Number(params.year) || new Date().getFullYear();
  const month = Number(params.month) || new Date().getMonth() + 1;
  const view = params.view === "agent" ? "agent" : "site";
  const siteId = params.siteId;

  const data = await getPlanningData(year, month);
  const monthLabel = formatMonthLabel(year, month);

  const singleSite = siteId
    ? data.sites.find((s) => s.siteId === siteId)
    : undefined;

  if (siteId && !singleSite) {
    return (
      <div className="planning-print min-h-screen bg-white p-4 text-black">
        <p>{fr.planning.printSiteNotFound}</p>
      </div>
    );
  }

  const exportCheck = singleSite
    ? computeSiteExportCheck(data, singleSite.siteId)
    : view === "site"
      ? computeMonthExportCheck(data)
      : { ready: true, errorCount: 0, warningCount: 0, errors: [] as string[] };

  const displayData = data;

  return (
    <div className="planning-print min-h-screen bg-white p-4 text-black">
      <style dangerouslySetInnerHTML={{ __html: PLANNING_PRINT_STYLES }} />
      <PlanningPrintTrigger autoPrint={exportCheck.ready} />

      <h1>BLACK SHIELD — {fr.planning.title}</h1>
      <p className="meta">
        {monthLabel}
        {singleSite ? (
          <>
            {" · "}
            {fr.planning.printSiteCalendar}: <strong>{singleSite.siteName}</strong>
          </>
        ) : (
          <> · {view === "site" ? fr.planning.bySite : fr.planning.byAgent}</>
        )}
        {!exportCheck.ready && (
          <>
            {" · "}
            <strong style={{ color: "#dc2626" }}>{fr.planning.exportBlocked}</strong>
          </>
        )}
      </p>

      {!exportCheck.ready && (
        <div className="print-blocked-banner">
          <h3>
            {fr.planning.exportBlockedTitle} ({exportCheck.errorCount}{" "}
            {fr.planning.error.toLowerCase()}
            {exportCheck.errorCount > 1 ? "s" : ""})
          </h3>
          <p>{fr.planning.exportBlockedDesc}</p>
          {exportCheck.errors.length > 0 && (
            <ul>
              {exportCheck.errors.slice(0, 12).map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
              {exportCheck.errors.length > 12 && (
                <li>… +{exportCheck.errors.length - 12} autres</li>
              )}
            </ul>
          )}
        </div>
      )}

      {!singleSite && (
        <>
          <div className="summary">
            <div>
              {fr.planning.summarySites}: <span>{displayData.summary.siteCount}</span>
            </div>
            <div>
              {fr.planning.summarySlots}: <span>{displayData.summary.totalSlots}</span>
            </div>
            <div>
              {fr.planning.summaryFilled}: <span>{displayData.summary.filledSlots}</span>
            </div>
            <div>
              {fr.planning.summaryMissing}: <span>{displayData.summary.missingSlots}</span>
            </div>
            <div>
              {fr.planning.summaryAlerts}: <span>{displayData.summary.alertCount}</span>
            </div>
          </div>

          <div className="legend">
            {displayData.siteOptions.map((site) => {
              const style = getSiteColorStyle(site.name);
              const colors: Record<string, string> = {
                gemeaux: "#3b82f6",
                ordinal: "#10b981",
                pleyel: "#f97316",
                douze: "#8b5cf6",
                visage: "#ec4899",
                default: "#888",
              };
              return (
                <div key={site.id} className="legend-item">
                  <span
                    className="dot"
                    style={{ background: colors[style.key] ?? colors.default }}
                  />
                  {style.shortLabel}
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "site" ? (
        singleSite ? (
          <SitePrintCalendar
            site={displayData.sites.find((s) => s.siteId === siteId)!}
            days={displayData.days}
            standalone
          />
        ) : (
          <SitePrintViewAll data={displayData} />
        )
      ) : (
        <AgentPrintView data={displayData} />
      )}
    </div>
  );
}

function SitePrintViewAll({ data }: { data: PlanningData }) {
  return (
    <>
      {data.sites.map((site) => (
        <SitePrintCalendar key={site.siteId} site={site} days={data.days} />
      ))}
    </>
  );
}

function AgentPrintView({ data }: { data: PlanningData }) {
  return (
    <table>
      <thead>
        <tr>
          <th className="agent-col">Agent</th>
          {data.days.map((day) => (
            <th key={day}>{day.slice(8, 10)}</th>
          ))}
          <th>{fr.planning.totalHours}</th>
        </tr>
      </thead>
      <tbody>
        {data.agents.map((agent) => (
          <tr key={agent.agentId}>
            <td className="agent-col">
              {agent.agentName}
              {agent.contractHours && (
                <>
                  <br />
                  <small>{agent.contractHours}h</small>
                </>
              )}
            </td>
            {agent.days.map((cell) => {
              const cls =
                cell.validationStatus === "off"
                  ? ""
                  : cell.validationStatus === "error"
                    ? "error"
                    : cell.validationStatus === "warning"
                      ? "warning"
                      : "filled";
              return (
                <td key={cell.date} className={cls}>
                  {cell.shiftType ? (
                    <>
                      {cell.siteName && (
                        <>
                          <small>{getSiteColorStyle(cell.siteName).shortLabel}</small>
                          <br />
                        </>
                      )}
                      {SHIFT_TYPE_LABELS[cell.shiftType]}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              );
            })}
            <td>
              <strong>{agent.totalHours}h</strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
