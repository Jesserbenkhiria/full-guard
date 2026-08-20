import { PrismaClient } from "@prisma/client";
import { seedAgentSiteRules } from "./seed-agent-site-rules";

const prisma = new PrismaClient();

async function main() {
  const sites = await prisma.site.findMany();
  const agents = await prisma.agent.findMany();

  const siteByKey: Record<string, (typeof sites)[0]> = {};
  for (const site of sites) {
    if (site.name.includes("Gémeaux")) siteByKey.GEMEAUX = site;
    else if (site.name === "ORDINAL") siteByKey.ORDINAL = site;
    else if (site.name === "LE DOUZE") siteByKey["LE DOUZE"] = site;
    else if (site.name === "PLEYEL") siteByKey.PLEYEL = site;
    else if (site.name === "VISAGE DU MONDE") siteByKey.VISAGE = site;
  }

  const agentMap = new Map<string, (typeof agents)[0]>();
  for (const agent of agents) {
    const key = agent.firstName.trim()
      ? `${agent.firstName.trim()}_${agent.lastName}`
      : agent.lastName;
    agentMap.set(key, agent);
    agentMap.set(agent.lastName, agent);
  }

  await seedAgentSiteRules(prisma, agentMap, siteByKey);

  // Sync agent profile fields from matrix
  const updates: { lastName: string; firstName?: string; data: Record<string, unknown> }[] = [
    { lastName: "KAID", data: { contractHours: 120, overtimeAllowed: false } },
    {
      lastName: "SEITI",
      data: { dayOnly: true, nightForbidden: true, canWorkNight: false },
    },
    {
      lastName: "MBODJI",
      data: {
        contractHours: 60,
        preferredDays: ["MONDAY", "TUESDAY"],
        overtimeAllowed: false,
      },
    },
  ];

  for (const u of updates) {
    const agent = agents.find(
      (a) =>
        a.lastName === u.lastName &&
        (!u.firstName || a.firstName.includes(u.firstName))
    );
    if (agent) {
      await prisma.agent.update({ where: { id: agent.id }, data: u.data });
      console.log(`✓ Profil mis à jour: ${agent.lastName}`);
    }
  }

  console.log("Migration AgentSiteRule terminée.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
