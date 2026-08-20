/**
 * Agent Constraint Specification — BLACK SHIELD / Guard Planning
 * Source: confirmed rules from Mr. Lajimi (+ updates in chat).
 *
 * ✅ = enforced as hard constraint (rules engine / AgentSiteRule)
 * ⚠️ = stored as preference or pending confirmation — does NOT hard-block
 */
import { DayOfWeek, SiteRestrictionType } from "@prisma/client";

export type SiteKey = "GEMEAUX" | "ORDINAL" | "PLEYEL" | "LE DOUZE" | "VISAGE";

export type AgentConstraintSpec = {
  agentKey: string;
  firstName: string;
  lastName: string;
  contractHours: number | null;
  overtimeAllowed: boolean;
  sites: {
    siteKey: SiteKey;
    ruleType: "ONLY" | "PREFERRED";
    allowedDays?: DayOfWeek[];
    fixedStartTime?: string;
    fixedEndTime?: string;
    maxHours?: number;
  }[];
  preferredDays?: DayOfWeek[];
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

const WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

const WEEKEND: DayOfWeek[] = [DayOfWeek.SATURDAY, DayOfWeek.SUNDAY];

export const AGENT_CONSTRAINTS: AgentConstraintSpec[] = [
  {
    agentKey: "Mohamed_LAJIMI",
    firstName: "Mohamed",
    lastName: "LAJIMI",
    contractHours: 156,
    overtimeAllowed: true,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    preferredDays: MON_SAT,
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    isTeamLeader: true,
    notes: "Les Gémeaux uniquement — souvent lun-mar-mer-jeu-sam — congé jusqu'au 24/08/2026",
    pendingConfirmations: ["Disponibilité vendredi/dimanche non figée"],
  },
  {
    agentKey: "Mohamed_DJEDIA",
    firstName: "Mohamed",
    lastName: "DJEDIA",
    contractHours: 156,
    overtimeAllowed: true,
    sites: [
      { siteKey: "GEMEAUX", ruleType: "ONLY" },
      { siteKey: "LE DOUZE", ruleType: "ONLY", fixedStartTime: "16:45" },
    ],
    preferredDays: MON_SAT,
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes: "Gémeaux principal + LE DOUZE possible (début 16h45)",
  },
  {
    agentKey: "Ibrahim Khalil_DIAKITE",
    firstName: "Ibrahim Khalil",
    lastName: "DIAKITE",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    pendingConfirmations: ["Peut-il remplacer sur d'autres sites ?"],
  },
  {
    agentKey: "Jeannot_SEITI",
    firstName: "Jeannot",
    lastName: "SEITI",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    canWorkNight: false,
    dayOnly: true,
    nightForbidden: true,
    notes: "Jour uniquement (nuit à reconfirmer avec M. Lajimi)",
    pendingConfirmations: ["Travail de nuit autorisé ou jour uniquement ?"],
  },
  {
    agentKey: "Pierre Marie_EVINA",
    firstName: "Pierre Marie",
    lastName: "EVINA",
    contractHours: 80,
    overtimeAllowed: false,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes: "Congés 14/09/2026 – 01/10/2026",
    pendingConfirmations: ["Uniquement Gémeaux ou flexible ?"],
  },
  {
    agentKey: "Mohammed_AOUFI",
    firstName: "Mohammed",
    lastName: "AOUFI",
    contractHours: null,
    overtimeAllowed: false,
    maxVacationsPerMonth: 5,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    isTeamLeader: true,
  },
  {
    agentKey: "YAHMADI",
    firstName: "",
    lastName: "YAHMADI",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [
      { siteKey: "GEMEAUX", ruleType: "PREFERRED" },
      { siteKey: "VISAGE", ruleType: "PREFERRED" },
    ],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes: "Quelques vacations seulement",
    pendingConfirmations: ["Volume exact de vacations"],
  },
  {
    agentKey: "Evelyne_HOUNGUES",
    firstName: "Evelyne",
    lastName: "HOUNGUES",
    contractHours: 120,
    overtimeAllowed: false,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    canWorkNight: false,
    dayOnly: true,
    nightForbidden: true,
    notes: "Journée uniquement — nuit interdite",
  },
  {
    agentKey: "Ramata_DEMBELE",
    firstName: "Ramata",
    lastName: "DEMBELE",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [{ siteKey: "GEMEAUX", ruleType: "ONLY" }],
    canWorkNight: false,
    dayOnly: true,
    nightForbidden: true,
    notes: "✅ Confirmé — journée uniquement, nuit interdite (Les Gémeaux)",
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
      { siteKey: "GEMEAUX", ruleType: "PREFERRED" },
    ],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes: "ORDINAL week-end + Gémeaux possible",
    pendingConfirmations: ["Gémeaux librement ou exceptions seulement ?"],
  },
  {
    agentKey: "DJONKA",
    firstName: "",
    lastName: "DJONKA",
    contractHours: 156,
    overtimeAllowed: true,
    sites: [{ siteKey: "LE DOUZE", ruleType: "ONLY", fixedStartTime: "16:45" }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
  },
  {
    agentKey: "Yacine_KAID",
    firstName: "Yacine",
    lastName: "KAID",
    contractHours: 120,
    overtimeAllowed: false,
    sites: [{ siteKey: "LE DOUZE", ruleType: "ONLY", maxHours: 120 }],
    canWorkNight: false,
    dayOnly: false,
    nightForbidden: true,
    pendingConfirmations: ["Horaires exacts LE DOUZE à confirmer"],
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
        maxHours: 60,
      },
    ],
    preferredDays: MON_TUE,
    canWorkNight: false,
    dayOnly: false,
    nightForbidden: true,
    notes: "LE DOUZE — lundi et mardi uniquement, max 60h",
  },
  {
    agentKey: "Gnagno_DALIGOU",
    firstName: "Gnagno",
    lastName: "DALIGOU",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [{ siteKey: "PLEYEL", ruleType: "ONLY" }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
  },
  {
    agentKey: "Georges_ZAMBA",
    firstName: "Georges",
    lastName: "ZAMBA",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [{ siteKey: "PLEYEL", ruleType: "ONLY" }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
  },
  {
    agentKey: "Cyrille_OUMBA",
    firstName: "Cyrille",
    lastName: "OUMBA",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [{ siteKey: "PLEYEL", ruleType: "ONLY" }],
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
  },
  {
    agentKey: "Marcelus_DORCE",
    firstName: "Marcelus",
    lastName: "DORCE",
    contractHours: 156,
    overtimeAllowed: false,
    sites: [],
    polyvalent: true,
    canWorkNight: true,
    dayOnly: false,
    nightForbidden: false,
    notes: "Polyvalent — tous sites, remplaçant",
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
      seeds.push({
        agentKey: c.agentKey,
        siteKey: site.siteKey,
        ruleType: site.ruleType,
        allowedDays: site.allowedDays,
        fixedStartTime: site.fixedStartTime,
        fixedEndTime: site.fixedEndTime,
        maxHours: site.maxHours,
        notes: c.notes,
      });
    }
  }
  return seeds;
}

export const PENDING_AGENT_CONFIRMATIONS = AGENT_CONSTRAINTS.filter(
  (c) => c.pendingConfirmations && c.pendingConfirmations.length > 0
).map((c) => ({
  agent: c.lastName,
  items: c.pendingConfirmations!,
}));
