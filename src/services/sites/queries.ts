import { prisma } from "@/lib/db";
import { formatAgentName } from "@/lib/constants";
import { getDefaultPlanningPeriod } from "@/services/planning/queries";
import { getPlanningData } from "@/services/planning/queries";
import { computeSiteCoverage } from "@/lib/planning/summary";

export type SiteHabitualAgent = {
  id: string;
  name: string;
  ruleType: "ONLY" | "PREFERRED";
};

export type SiteListItem = {
  id: string;
  name: string;
  address: string | null;
  client: string | null;
  active: boolean;
  notes: string | null;
  shiftDurationHours: number | null;
  createdAt: Date;
  updatedAt: Date;
  requirements: {
    id: string;
    siteId: string;
    label: string | null;
    days: import("@prisma/client").DayOfWeek[];
    shiftType: import("@prisma/client").ShiftType;
    startTime: string;
    endTime: string;
    role: import("@prisma/client").PositionRole;
    agentCount: number;
    priority: number;
    active: boolean;
    specificDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  coverage: {
    total: number;
    filled: number;
    missing: number;
    monthLabel: string;
  };
  habitualAgents: SiteHabitualAgent[];
  hasPolyvalentPool: boolean;
};

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export async function getSitesPageData(): Promise<SiteListItem[]> {
  const [sites, agentRules, polyvalentCount, period] = await Promise.all([
    prisma.site.findMany({
      include: {
        requirements: { where: { active: true }, orderBy: { priority: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.agentSiteRule.findMany({
      where: { active: true, ruleType: { in: ["ONLY", "PREFERRED"] } },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, active: true } },
      },
      orderBy: [{ ruleType: "asc" }, { agent: { lastName: "asc" } }],
    }),
    prisma.agent.count({
      where: {
        active: true,
        siteRestrictionType: "ANY",
        siteRules: { none: { active: true } },
      },
    }),
    getDefaultPlanningPeriod(),
  ]);

  let planningSites: Awaited<ReturnType<typeof getPlanningData>>["sites"] = [];
  try {
    const planning = await getPlanningData(period.year, period.month);
    planningSites = planning.sites;
  } catch {
    planningSites = [];
  }

  const monthLabel = `${MONTH_NAMES[period.month - 1]} ${period.year}`;

  const rulesBySite = new Map<string, SiteHabitualAgent[]>();
  for (const rule of agentRules) {
    if (!rule.agent.active) continue;
    const list = rulesBySite.get(rule.siteId) ?? [];
    list.push({
      id: rule.agent.id,
      name: formatAgentName(rule.agent.firstName, rule.agent.lastName),
      ruleType: rule.ruleType as "ONLY" | "PREFERRED",
    });
    rulesBySite.set(rule.siteId, list);
  }

  return sites.map((site) => {
    const planningSite = planningSites.find((s) => s.siteId === site.id);
    const coverageStats = planningSite
      ? computeSiteCoverage(planningSite)
      : { total: 0, filled: 0, missing: 0 };

    return {
      ...site,
      coverage: {
        ...coverageStats,
        monthLabel,
      },
      habitualAgents: rulesBySite.get(site.id) ?? [],
      hasPolyvalentPool: polyvalentCount > 0,
    };
  });
}
