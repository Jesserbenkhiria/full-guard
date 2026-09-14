/**
 * Agent Constraint Specification — BLACK SHIELD / Guard Planning
 * Source: spec finale M. Lajimi (Gémeaux / Mairie, 21/08/2026).
 *
 * ✅ = enforced as hard constraint (rules engine / AgentSiteRule)
 * ⚠️ = stored as preference or pending confirmation — does NOT hard-block
 */
import { DayOfWeek, SiteRestrictionType } from "@prisma/client";

export type SiteKey =
  | "GEMEAUX"
  | "ORDINAL"
  | "PLEYEL"
  | "LE DOUZE"
  | "VISAGE"
  | "MEDIATHEQUE";

export type AgentConstraintSpec = {
  agentKey: string;
  firstName: string;
  lastName: string;
  contractHours: number | null;
  overtimeAllowed: boolean;
  /** Several shifts in a row OK (vac à la filet) — relaxes consecutive-day limits in auto-fill. */
  consecutiveShiftsAllowed?: boolean;
  sites: {
    siteKey: SiteKey;
    ruleType: "ONLY" | "PREFERRED";
    allowedDays?: DayOfWeek[];
    fixedStartTime?: string;
    fixedEndTime?: string;
    maxHours?: number;
    /** LE DOUZE overflow backup ordering (Evina primary, Djedia secondary). */
    backupRole?: "primary" | "secondary";
    /** Alternate Saturday hours on this site (e.g. LE DOUZE 08:45–19:30). */
    saturdayStartTime?: string;
    saturdayEndTime?: string;
    /** Monday-only hours when they differ from the usual weekday band (Excel SSIAP). */
    mondayStartTime?: string;
    mondayEndTime?: string;
    /** Dated Excel hour overrides, e.g. LE DOUZE 24/09 08:00–16:45. */
    dateOverrides?: { date: string; startTime: string; endTime: string }[];
  }[];
  preferredDays?: DayOfWeek[];
  /** Hard cap on shifts for a weekday in a month (e.g. Kaid — max 2 Saturdays). */
  maxShiftsPerMonthByDay?: Partial<Record<DayOfWeek, number>>;
  /** Hard cap on consecutive work days (Kaid: 3 — pas 4 vac à la file). */
  maxConsecutiveWorkDays?: number;
  /**
   * Distinct Sat–Sun weeks worked in the month.
   * Default 2. `null` = no cap (Oumar CAMARA — ORDINAL every weekend).
   */
  maxWeekendsPerMonth?: number | null;
  /** Hard cap on assignments (vacations) in the month. */
  maxShiftsPerMonth?: number | null;
  canWorkNight: boolean;
  dayOnly: boolean;
  nightForbidden: boolean;
  maxVacationsPerMonth?: number | null;
  isTeamLeader?: boolean;
  polyvalent?: boolean;
  notes?: string;
  pendingConfirmations?: string[];
};

const MON_SAT: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
];

const MON_TUE: DayOfWeek[] = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY];

/** Lun–mar–mer–jeu–sam (pas vendredi) — Lajimi & Djedia */
const MON_THU_SAT: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
];

const KAID_DAYS: DayOfWeek[] = [
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

const WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

const WEEKEND: DayOfWeek[] = [DayOfWeek.SATURDAY, DayOfWeek.SUNDAY];

const MON_TUE_SAT: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.SATURDAY,
];

const FRI_SAT_SUN: DayOfWeek[] = [
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
];

const MED_KIBRI_DAYS: DayOfWeek[] = [
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

export const AGENT_CONSTRAINTS: AgentConstraintSpec[] = [
  {
    agentKey: "Mohamed_LAJIMI",
    firstName: "Mohamed",
    lastName: "LAJIMI",
    contractHours: 156,
    overtimeAllowed: true,
    consecutiveShiftsAllowed: false,
    maxConsecutiveWorkDays: 3,
    maxWeekendsPerMonth: 3,
    sites: [
      {
        siteKey: "GEMEAUX",
        ruleType: "ONLY",
        allowedDays: [
          DayOfWeek.MONDAY,
          DayOfWeek.TUESDAY,
          DayOfWeek.WEDNESDAY,
          DayOfWeek.THURSDAY,
          DayOfWeek.SATURDAY,
        ],
      },
    ],
    preferredDays: MON_THU_SAT,
    canWorkNight: false,
    dayOnly: true,
    nightForbidden: true,
    isTeamLeader: true,
    notes:
      "✅ Gémeaux chef SSIAP 2 — lun-jeu + sam jour. Pas de soir ni dimanche. Dépassement 156h OK",
  },
  {
    agentKey: "Dahmen_DJEDIA",
    firstName: "Dahmen",
    lastName: "DJEDIA",
    contractHours: 156,
    overtimeAllowed: true,
    consecutiveShiftsAllowed: false,
    maxConsecutiveWorkDays: 3,
    maxShiftsPerMonth: 13,
    maxWeekendsPerMonth: 2,
    sites: [
      {
        siteKey: "GEMEAUX",
        ruleType: "ONLY",
        allowedDays: [
          DayOfWeek.MONDAY,
          DayOfWeek.TUESDAY,
          DayOfWeek.WEDNESDAY,
          DayOfWeek.THURSDAY,
          DayOfWeek.SATURDAY,
        ],
        fixedStartTime: "07:00",
        fixedEndTime: "19:00",
      },
    ],
    preferredDays: MON_THU_SAT,
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes:
      "✅ Gémeaux — oct. 2026 : lun–jeu + sam jour (comme LAJIMI), 156 h OK",
  },
  {
    agentKey: "Ibrahim Khalil_DIAKITE",
    firstName: "Ibrahim Khalil",
    lastName: "DIAKITE",
    contractHours: 156,
    overtimeAllowed: false,
    consecutiveShiftsAllowed: false,
    maxShiftsPerMonth: 13,
    maxConsecutiveWorkDays: 3,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes:
      "✅ Gémeaux nuit uniquement. Max 156 h / 13 vac. Max 3 vac à la filet. À partir du 19/10 : ven–sam–dim nuit",
  },
  {
    agentKey: "Jeannot_SEITI",
    firstName: "Jeannot",
    lastName: "SEITI",
    contractHours: 156,
    overtimeAllowed: false,
    maxShiftsPerMonth: 13,
    maxWeekendsPerMonth: 2,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    canWorkNight: false,
    dayOnly: true,
    nightForbidden: true,
    notes: "✅ Gémeaux — journée uniquement, 156 h / 13 vac",
  },
  {
    agentKey: "Pierre Marie_EVINA",
    firstName: "Pierre Marie",
    lastName: "EVINA",
    contractHours: 80,
    overtimeAllowed: false,
    sites: [
      { siteKey: "GEMEAUX", ruleType: "PREFERRED" },
      {
        siteKey: "LE DOUZE",
        ruleType: "PREFERRED",
        fixedStartTime: "08:45",
        fixedEndTime: "16:45",
        backupRole: "primary",
        dateOverrides: [{ date: "2026-09-24", startTime: "08:00", endTime: "16:45" }],
      },
    ],
    canWorkNight: false,
    dayOnly: true,
    nightForbidden: true,
    notes:
      "✅ Oct. 2026 : 80–100 h. Vendredis SSIAP 2 jour de préférence",
    preferredDays: [DayOfWeek.FRIDAY],
  },
  {
    agentKey: "Mohammed_AOUFI",
    firstName: "Mohammed",
    lastName: "AOUFI",
    contractHours: null,
    overtimeAllowed: false,
    maxVacationsPerMonth: 5,
    maxShiftsPerMonth: 5,
    maxWeekendsPerMonth: 2,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    isTeamLeader: true,
    notes:
      "✅ Gémeaux dispos sept. 2026 : 04 nuit, 11 jour, 21 jour, 23 jour, 27 nuit",
  },
  {
    agentKey: "YAHMADI",
    firstName: "",
    lastName: "YAHMADI",
    contractHours: 156,
    overtimeAllowed: true,
    consecutiveShiftsAllowed: true,
    maxWeekendsPerMonth: 3,
    sites: [
      { siteKey: "VISAGE", ruleType: "ONLY" },
      {
        siteKey: "GEMEAUX",
        ruleType: "ONLY",
        fixedStartTime: "19:00",
        fixedEndTime: "07:00",
      },
    ],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes:
      "✅ VISAGE + Gémeaux soir 19h–07h — pas de chevauchement. Dépassement OK",
  },
  {
    agentKey: "Athoumani_HALIDI",
    firstName: "Athoumani",
    lastName: "HALIDI",
    contractHours: null,
    overtimeAllowed: true,
    sites: [
      { siteKey: "VISAGE", ruleType: "PREFERRED", allowedDays: [DayOfWeek.SUNDAY] },
      {
        siteKey: "GEMEAUX",
        ruleType: "PREFERRED",
        fixedStartTime: "19:00",
        fixedEndTime: "07:00",
      },
    ],
    preferredDays: [DayOfWeek.SUNDAY],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes:
      "✅ VISAGE dimanches + quelques nuits Gémeaux. Campus Saint Christophe 07-19 les 01,02,04,07,08,09,14,16,17,22,26,27,30. Indispo 11–13/09",
  },
  {
    agentKey: "Evelyne_HOUNGUES",
    firstName: "Evelyne",
    lastName: "HOUNGUES",
    contractHours: 120,
    overtimeAllowed: false,
    maxWeekendsPerMonth: 2,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    canWorkNight: false,
    dayOnly: true,
    nightForbidden: true,
    maxShiftsPerMonth: 10,
    notes: "✅ Gémeaux — journée uniquement, 120 h max",
  },
  {
    agentKey: "Ramata_DEMBELE",
    firstName: "Ramata",
    lastName: "DEMBELE",
    contractHours: 156,
    overtimeAllowed: false,
    maxShiftsPerMonth: 13,
    maxWeekendsPerMonth: 2,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    canWorkNight: false,
    dayOnly: true,
    nightForbidden: true,
    notes: "✅ Gémeaux journée uniquement — 156 h / 13 vac",
  },
  {
    agentKey: "Lamine_CAMARA",
    firstName: "Lamine",
    lastName: "CAMARA",
    contractHours: null,
    overtimeAllowed: false,
    sites: [
      {
        siteKey: "ORDINAL",
        ruleType: "ONLY",
        allowedDays: WEEKDAYS,
        fixedStartTime: "10:00",
        fixedEndTime: "17:00",
      },
    ],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes: "ORDINAL lun-ven 10h-17h",
  },
  {
    agentKey: "Oumar_CAMARA",
    firstName: "Oumar",
    lastName: "CAMARA",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [
      {
        siteKey: "ORDINAL",
        ruleType: "ONLY",
        allowedDays: WEEKEND,
        fixedStartTime: "08:00",
        fixedEndTime: "20:00",
      },
    ],
    preferredDays: WEEKEND,
    maxWeekendsPerMonth: null,
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes: "✅ Confirmé — ORDINAL sam-dim uniquement (08h-20h), tous les week-ends",
  },
  {
    agentKey: "DJONKA",
    firstName: "",
    lastName: "DJONKA",
    contractHours: 156,
    overtimeAllowed: true,
    consecutiveShiftsAllowed: true,
    maxShiftsPerMonthByDay: { [DayOfWeek.SATURDAY]: 2 },
    sites: [
      {
        siteKey: "LE DOUZE",
        ruleType: "ONLY",
        allowedDays: [...WEEKDAYS, DayOfWeek.SATURDAY],
        fixedStartTime: "16:45",
        fixedEndTime: "23:30",
        mondayStartTime: "16:45",
        mondayEndTime: "23:00",
        saturdayStartTime: "08:45",
        saturdayEndTime: "19:30",
        dateOverrides: [
          { date: "2026-09-30", startTime: "08:45", endTime: "23:30" },
        ],
      },
    ],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes: "✅ Site LE DOUZE soir lun 16h45-23h / mar-ven 16h45-23h30 + 2 samedis 08h45-19h30 — 30/09 journée 08h45-23h30 — peut dépasser 156h",
  },
  {
    agentKey: "Yacine_KAID",
    firstName: "Yacine",
    lastName: "KAID",
    contractHours: 120,
    overtimeAllowed: false,
    maxShiftsPerMonthByDay: { [DayOfWeek.SATURDAY]: 2 },
    maxConsecutiveWorkDays: 3,
    sites: [
      {
        siteKey: "LE DOUZE",
        ruleType: "ONLY",
        allowedDays: KAID_DAYS,
        fixedStartTime: "08:45",
        fixedEndTime: "16:45",
        saturdayStartTime: "08:45",
        saturdayEndTime: "19:30",
        dateOverrides: [
          { date: "2026-09-24", startTime: "08:00", endTime: "16:45" },
          { date: "2026-09-28", startTime: "08:45", endTime: "16:45" },
          { date: "2026-09-29", startTime: "08:45", endTime: "16:45" },
        ],
        maxHours: 120,
      },
    ],
    preferredDays: KAID_DAYS,
    canWorkNight: false,
    dayOnly: false,
    nightForbidden: true,
    notes: "✅ LE DOUZE mer-jeu-ven 08h45-16h45 + 2 samedis 08h45-19h30 — 28-29/09 jour aussi — strict 120h — max 3 vac à la file (si samedi, pas le vendredi)",
  },
  {
    agentKey: "MBODJI",
    firstName: "",
    lastName: "MBODJI",
    contractHours: 60,
    overtimeAllowed: false,
    sites: [
      {
        siteKey: "LE DOUZE",
        ruleType: "ONLY",
        allowedDays: MON_TUE,
        fixedStartTime: "08:45",
        fixedEndTime: "16:45",
        maxHours: 60,
      },
    ],
    preferredDays: MON_TUE,
    canWorkNight: false,
    dayOnly: false,
    nightForbidden: true,
    notes: "✅ Site LE DOUZE lun-mar jour 08h45-16h45 — strict 60h, pas de dépassement",
  },
  {
    agentKey: "Gnagno_DALIGOU",
    firstName: "Gnagno",
    lastName: "DALIGOU",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [{ siteKey: "PLEYEL", ruleType: "ONLY", maxHours: 156 }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes: "✅ PLEYEL uniquement — 12 vac / 156h, maximum 2 week-ends / mois",
  },
  {
    agentKey: "Georges_ZAMBA",
    firstName: "Georges",
    lastName: "ZAMBA",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [{ siteKey: "PLEYEL", ruleType: "ONLY", maxHours: 156 }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    maxWeekendsPerMonth: 3,
    notes:
      "✅ PLEYEL — 12 vac / 156h. Repos 02/09 (visite médicale). WE 26–27 en plus (Lajimi)",
  },
  {
    agentKey: "Cyrille_OUMBA",
    firstName: "Cyrille",
    lastName: "OUMBA",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [{ siteKey: "PLEYEL", ruleType: "ONLY", maxHours: 156 }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes: "✅ PLEYEL uniquement — 12 vac / 156h, maximum 2 week-ends / mois",
  },
  {
    agentKey: "BELLATTRACH",
    firstName: "",
    lastName: "BELLATTRACH",
    contractHours: null,
    overtimeAllowed: true,
    sites: [{ siteKey: "PLEYEL", ruleType: "PREFERRED" }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes: "✅ PLEYEL reliquat — maximum 2 week-ends / mois",
  },
  {
    agentKey: "Marcelus_DORCE",
    firstName: "Marcelus",
    lastName: "DORCE",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [
      { siteKey: "PLEYEL", ruleType: "PREFERRED", maxHours: 156 },
      { siteKey: "GEMEAUX", ruleType: "PREFERRED" },
    ],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes:
      "✅ PLEYEL + Gémeaux — jamais les deux sites le même jour (oct. 2026)",
  },
  {
    agentKey: "CHARGUI",
    firstName: "",
    lastName: "CHARGUI",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [
      {
        siteKey: "GEMEAUX",
        ruleType: "PREFERRED",
        allowedDays: WEEKEND,
      },
    ],
    preferredDays: WEEKEND,
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes:
      "✅ Gémeaux — oct. 2026 : joker (surtout WE), à minimiser. Chef le vendredi seulement si EVINA absente",
  },
  {
    agentKey: "KIBRI",
    firstName: "",
    lastName: "KIBRI",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [
      {
        siteKey: "MEDIATHEQUE",
        ruleType: "ONLY",
        allowedDays: MED_KIBRI_DAYS,
      },
      { siteKey: "GEMEAUX", ruleType: "PREFERRED" },
    ],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes:
      "✅ Médiathèque + Gémeaux pour 156 h — pas de chevauchement Médiathèque/Gémeaux même jour",
  },
];

export function constraintToAgentSeed(c: AgentConstraintSpec) {
  const siteRestrictionType = c.polyvalent
    ? SiteRestrictionType.ANY
    : c.sites.some((s) => s.ruleType === "PREFERRED") &&
        !c.sites.some((s) => s.ruleType === "ONLY")
      ? SiteRestrictionType.PREFERRED
      : c.sites.length > 0
        ? SiteRestrictionType.ONLY
        : SiteRestrictionType.ANY;

  const authorizedSiteKeys =
    c.polyvalent || c.sites.length === 0 ? [] : c.sites.map((s) => s.siteKey);

  return {
    firstName: c.firstName,
    lastName: c.lastName,
    contractHours: c.contractHours,
    overtimeAllowed: c.overtimeAllowed,
    canWorkNight: c.canWorkNight,
    maxVacationsPerMonth: c.maxVacationsPerMonth ?? null,
    preferredDays: c.preferredDays ?? [],
    dayOnly: c.dayOnly,
    nightForbidden: c.nightForbidden,
    isTeamLeader: c.isTeamLeader ?? false,
    notes: c.notes,
    siteRestrictionType,
    authorizedSiteKeys,
  };
}

export function constraintsToSiteRuleSeeds() {
  const seeds: {
    agentKey: string;
    siteKey: SiteKey;
    ruleType: "ONLY" | "PREFERRED";
    allowedDays?: DayOfWeek[];
    fixedStartTime?: string;
    fixedEndTime?: string;
    maxHours?: number;
    notes?: string;
  }[] = [];

  for (const c of AGENT_CONSTRAINTS) {
    if (c.polyvalent) continue;
    for (const site of c.sites) {
      const noteParts = [
        site.backupRole ? `backup:${site.backupRole}` : null,
        site.saturdayStartTime && site.saturdayEndTime
          ? `sat:${site.saturdayStartTime}-${site.saturdayEndTime}`
          : null,
        site.mondayStartTime && site.mondayEndTime
          ? `mon:${site.mondayStartTime}-${site.mondayEndTime}`
          : null,
        ...(site.dateOverrides ?? []).map(
          (o) => `date:${o.date}:${o.startTime}-${o.endTime}`
        ),
        c.notes,
      ].filter(Boolean);
      seeds.push({
        agentKey: c.agentKey,
        siteKey: site.siteKey,
        ruleType: site.ruleType,
        allowedDays: site.allowedDays,
        fixedStartTime: site.fixedStartTime,
        fixedEndTime: site.fixedEndTime,
        maxHours: site.maxHours,
        notes: noteParts.length > 0 ? noteParts.join(" | ") : undefined,
      });
    }
  }
  return seeds;
}

/** Day-of-week shift caps for hard rules (e.g. Kaid max 2 Saturdays). */
export function getAgentDayShiftLimits(
  agentKey: string
): Partial<Record<DayOfWeek, number>> | null {
  const spec = AGENT_CONSTRAINTS.find((c) => c.agentKey === agentKey);
  return spec?.maxShiftsPerMonthByDay ?? null;
}

const DEFAULT_MAX_WEEKENDS_PER_MONTH = 2;

/** `null` = no weekend cap. Default 2 distinct Sat–Sun weeks. */
export function getAgentMaxWeekendsPerMonth(agentKey: string): number | null {
  const spec = AGENT_CONSTRAINTS.find((c) => c.agentKey === agentKey);
  if (spec && "maxWeekendsPerMonth" in spec && spec.maxWeekendsPerMonth === null) {
    return null;
  }
  if (spec?.maxWeekendsPerMonth != null) return spec.maxWeekendsPerMonth;
  return DEFAULT_MAX_WEEKENDS_PER_MONTH;
}

export function getAgentMaxShiftsPerMonth(agentKey: string): number | null {
  return AGENT_CONSTRAINTS.find((c) => c.agentKey === agentKey)?.maxShiftsPerMonth ?? null;
}

const DEFAULT_MAX_CONSECUTIVE_WORK_DAYS = 5;
const FLEX_MAX_CONSECUTIVE_WORK_DAYS = 7;

export function getAgentMaxConsecutiveWorkDays(agentKey: string): number {
  const spec = AGENT_CONSTRAINTS.find((c) => c.agentKey === agentKey);
  if (spec?.maxConsecutiveWorkDays != null) return spec.maxConsecutiveWorkDays;
  if (spec?.consecutiveShiftsAllowed) return FLEX_MAX_CONSECUTIVE_WORK_DAYS;
  return DEFAULT_MAX_CONSECUTIVE_WORK_DAYS;
}

export function agentAllowsConsecutiveShifts(agentKey: string): boolean {
  return AGENT_CONSTRAINTS.find((c) => c.agentKey === agentKey)?.consecutiveShiftsAllowed === true;
}

export function agentKeyFromAgent(agent: {
  firstName: string;
  lastName: string;
}): string {
  const full = agent.firstName.trim()
    ? `${agent.firstName.trim()}_${agent.lastName}`
    : agent.lastName;
  if (AGENT_CONSTRAINTS.some((c) => c.agentKey === full)) return full;
  const byLast = AGENT_CONSTRAINTS.find(
    (c) => c.lastName === agent.lastName && (!c.firstName.trim() || c.firstName === agent.firstName)
  );
  if (byLast) return byLast.agentKey;
  const lastOnly = AGENT_CONSTRAINTS.find((c) => c.lastName === agent.lastName && !c.firstName.trim());
  if (lastOnly) return lastOnly.agentKey;
  return full;
}

export function getAgentDayShiftLimitsById(
  agents: { id: string; firstName: string; lastName: string }[],
  agentId: string
): Partial<Record<DayOfWeek, number>> | null {
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return null;
  const key = agent.firstName.trim()
    ? `${agent.firstName.trim()}_${agent.lastName}`
    : agent.lastName;
  return getAgentDayShiftLimits(key);
}

export const PENDING_AGENT_CONFIRMATIONS = AGENT_CONSTRAINTS.filter(
  (c) => c.pendingConfirmations && c.pendingConfirmations.length > 0
).map((c) => ({
  agent: c.lastName,
  items: c.pendingConfirmations!,
}));
