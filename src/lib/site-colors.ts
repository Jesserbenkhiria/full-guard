/** Company visual language — same colors across agents, planning, alerts, PDFs. */

export type SiteColorKey =
  | "gemeaux"
  | "ordinal"
  | "pleyel"
  | "douze"
  | "visage"
  | "mediatheque"
  | "default";

export type SiteColorStyle = {
  key: SiteColorKey;
  shortLabel: string;
  badgeClass: string;
  dotClass: string;
  ringClass: string;
  cellHeatClass: string;
};

const SITE_STYLES: Record<SiteColorKey, Omit<SiteColorStyle, "key">> = {
  gemeaux: {
    shortLabel: "Les Gémeaux",
    badgeClass:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
    dotClass: "bg-blue-500",
    ringClass: "ring-blue-200 dark:ring-blue-800",
    cellHeatClass: "bg-blue-500/20 border-blue-400/40",
  },
  ordinal: {
    shortLabel: "ORDINAL",
    badgeClass:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    dotClass: "bg-emerald-500",
    ringClass: "ring-emerald-200 dark:ring-emerald-800",
    cellHeatClass: "bg-emerald-500/20 border-emerald-400/40",
  },
  pleyel: {
    shortLabel: "PLEYEL",
    badgeClass:
      "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200",
    dotClass: "bg-orange-500",
    ringClass: "ring-orange-200 dark:ring-orange-800",
    cellHeatClass: "bg-orange-500/20 border-orange-400/40",
  },
  douze: {
    shortLabel: "LE DOUZE",
    badgeClass:
      "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
    dotClass: "bg-violet-500",
    ringClass: "ring-violet-200 dark:ring-violet-800",
    cellHeatClass: "bg-violet-500/20 border-violet-400/40",
  },
  visage: {
    shortLabel: "Visage du Monde",
    badgeClass:
      "border-pink-200 bg-pink-50 text-pink-800 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-200",
    dotClass: "bg-pink-500",
    ringClass: "ring-pink-200 dark:ring-pink-800",
    cellHeatClass: "bg-pink-500/20 border-pink-400/40",
  },
  mediatheque: {
    shortLabel: "Médiathèque",
    badgeClass:
      "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
    dotClass: "bg-cyan-500",
    ringClass: "ring-cyan-200 dark:ring-cyan-800",
    cellHeatClass: "bg-cyan-500/20 border-cyan-400/40",
  },
  default: {
    shortLabel: "Site",
    badgeClass: "border-border bg-muted text-muted-foreground",
    dotClass: "bg-muted-foreground",
    ringClass: "ring-border",
    cellHeatClass: "bg-muted/40 border-border",
  },
};

function normalizeSiteNameForMatch(siteName: string): string {
  return siteName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
}

export function resolveSiteColorKey(siteName: string): SiteColorKey {
  const normalized = normalizeSiteNameForMatch(siteName);
  if (normalized.includes("GEMEAUX")) return "gemeaux";
  if (normalized.includes("ORDINAL")) return "ordinal";
  if (normalized.includes("PLEYEL")) return "pleyel";
  if (normalized.includes("DOUZE")) return "douze";
  if (normalized.includes("VISAGE")) return "visage";
  if (normalized.includes("MEDIATHEQUE") || normalized.includes("HORLOGE")) return "mediatheque";
  return "default";
}

export function getSiteColorStyle(siteName: string): SiteColorStyle {
  const key = resolveSiteColorKey(siteName);
  return { key, ...SITE_STYLES[key] };
}

export function shortenSiteName(name: string): string {
  return getSiteColorStyle(name).shortLabel;
}

export const POLYVALENT_BADGE_CLASS =
  "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";

export const CONTRACT_HOURS_STYLES: Record<
  number,
  { badgeClass: string; dotClass: string }
> = {
  156: {
    badgeClass:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    dotClass: "bg-emerald-500",
  },
  120: {
    badgeClass:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
    dotClass: "bg-amber-500",
  },
  80: {
    badgeClass:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
    dotClass: "bg-blue-500",
  },
  60: {
    badgeClass:
      "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
    dotClass: "bg-violet-500",
  },
};

export function getContractHoursStyle(hours: number | null | undefined) {
  if (hours != null && hours in CONTRACT_HOURS_STYLES) {
    return CONTRACT_HOURS_STYLES[hours];
  }
  return {
    badgeClass: "border-border bg-muted text-muted-foreground",
    dotClass: "bg-muted-foreground",
  };
}
