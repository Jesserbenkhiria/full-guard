import { AlertSeverity, PrismaClient, SiteRestrictionType } from "@prisma/client";

const prisma = new PrismaClient();

type AgentAuthRule = {
  match: (lastName: string, firstName: string) => boolean;
  siteRestrictionType: SiteRestrictionType;
  siteNames: string[];
};

const RULES: AgentAuthRule[] = [
  {
    match: (ln) =>
      ["LAJIMI", "DJEDIA", "AOUFI", "DIAKITE", "HOUNGUES", "DEMBELE", "SEITI", "EVINA"].includes(
        ln
      ),
    siteRestrictionType: SiteRestrictionType.ONLY,
    siteNames: ["Les Gémeaux - Mairie de Cergy"],
  },
  {
    match: (ln, fn) => ln === "CAMARA" && fn.toLowerCase().includes("lamine"),
    siteRestrictionType: SiteRestrictionType.ONLY,
    siteNames: ["ORDINAL"],
  },
  {
    match: (ln, fn) => ln === "CAMARA" && fn.toLowerCase().includes("oumar"),
    siteRestrictionType: SiteRestrictionType.ONLY,
    siteNames: ["ORDINAL"],
  },
  {
    match: (ln) => ["DALIGOU", "ZAMBA", "OUMBA"].includes(ln),
    siteRestrictionType: SiteRestrictionType.ONLY,
    siteNames: ["PLEYEL"],
  },
  {
    match: (ln) => ["MBODJI", "DJONKA", "KAID"].includes(ln),
    siteRestrictionType: SiteRestrictionType.ONLY,
    siteNames: ["LE DOUZE"],
  },
  {
    match: (ln) => ln === "YAHMADI",
    siteRestrictionType: SiteRestrictionType.PREFERRED,
    siteNames: ["Les Gémeaux - Mairie de Cergy", "VISAGE DU MONDE"],
  },
  {
    match: (ln) => ln === "DORCE",
    siteRestrictionType: SiteRestrictionType.ANY,
    siteNames: [],
  },
];

async function main() {
  const sites = await prisma.site.findMany();
  const siteIdByName = new Map(sites.map((s) => [s.name, s.id]));
  const agents = await prisma.agent.findMany();

  for (const agent of agents) {
    const rule = RULES.find((r) => r.match(agent.lastName, agent.firstName));
    if (!rule) continue;

    const allowedSiteIds = rule.siteNames
      .map((name) => siteIdByName.get(name))
      .filter((id): id is string => Boolean(id));

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        siteRestrictionType: rule.siteRestrictionType,
        allowedSiteIds,
      },
    });

    console.log(
      `✓ ${agent.lastName} → ${rule.siteRestrictionType} [${rule.siteNames.join(", ") || "ALL"}]`
    );
  }

  const newRules = [
    {
      code: "SITE_NOT_AUTHORIZED",
      name: "Site non autorisé",
      description: "L'agent n'est pas autorisé sur ce site (règle d'affectation)",
      severity: AlertSeverity.ERROR,
      category: "restrictions",
    },
    {
      code: "SITE_PREFERRED_WARNING",
      name: "Site hors périmètre préféré",
      description: "L'agent est affecté en dehors de ses sites préférés",
      severity: AlertSeverity.WARNING,
      category: "restrictions",
    },
  ];

  for (const rule of newRules) {
    await prisma.rule.upsert({
      where: { code: rule.code },
      create: rule,
      update: rule,
    });
  }

  console.log("Migration site authorization terminée.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
