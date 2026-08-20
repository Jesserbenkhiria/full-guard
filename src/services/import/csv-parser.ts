/**
 * Sample CSV/Excel import parser — MVP structure for Phase 8.
 * Parses rows into normalized assignment suggestions.
 */

export type ImportRow = {
  agentName: string;
  siteName: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
};

export type ParseResult = {
  success: boolean;
  rows: ImportRow[];
  errors: string[];
};

export function parseCsvContent(content: string): ParseResult {
  const lines = content.trim().split(/\r?\n/);
  const errors: string[] = [];
  const rows: ImportRow[] = [];

  if (lines.length < 2) {
    return { success: false, rows: [], errors: ["File is empty or has no data rows"] };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  const required = ["agent", "site", "date", "shift", "start", "end"];
  for (const col of required) {
    if (!headers.some((h) => h.includes(col))) {
      errors.push(`Missing column matching '${col}'`);
    }
  }

  if (errors.length > 0) {
    return { success: false, rows: [], errors };
  }

  const idx = (name: string) => headers.findIndex((h) => h.includes(name));

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.every((c) => !c)) continue;

    rows.push({
      agentName: cols[idx("agent")] ?? "",
      siteName: cols[idx("site")] ?? "",
      date: cols[idx("date")] ?? "",
      shiftType: cols[idx("shift")] ?? "DAY",
      startTime: cols[idx("start")] ?? "08:00",
      endTime: cols[idx("end")] ?? "20:00",
    });
  }

  return { success: true, rows, errors: [] };
}
