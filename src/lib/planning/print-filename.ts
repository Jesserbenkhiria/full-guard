import { getSiteColorStyle } from "@/lib/site-colors";

/** Safe segment for browser “Save as PDF” default filename (from document.title). */
export function sanitizePrintFilenamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildPlanningPrintDocumentTitle(options: {
  year: number;
  month: number;
  siteName?: string;
  view?: "site" | "agent";
}): string {
  const monthPart = `${options.year}-${String(options.month).padStart(2, "0")}`;

  if (options.siteName) {
    const sitePart = sanitizePrintFilenamePart(getSiteColorStyle(options.siteName).shortLabel);
    return `planning-${monthPart}-${sitePart}`;
  }

  if (options.view === "agent") {
    return `planning-${monthPart}-agents`;
  }

  return `planning-${monthPart}-sites`;
}
