import { PrismaClient } from "@prisma/client";
import { seedAgentSiteRules } from "./seed-agent-site-rules";
import { AGENT_CONSTRAINTS, constraintToAgentSeed } from "../src/data/agent-constraints";

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

  for (const spec of AGENT_CONSTRAINTS) {
    const seed = constraintToAgentSeed(spec);
    const agent = agentMap.get(spec.agentKey);
    if (!agent) {
      console.warn(`⚠ Agent introuvable: ${spec.agentKey}`);
      continue;
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        contractHours: seed.contractHours,
        overtimeAllowed: seed.overtimeAllowed,
        canWorkNight: seed.canWorkNight,
        maxVacationsPerMonth: seed.maxVacationsPerMonth,
        preferredDays: seed.preferredDays,
        dayOnly: seed.dayOnly,
        nightForbidden: seed.nightForbidden,
        isTeamLeader: seed.isTeamLeader,
        notes: seed.notes,
        siteRestrictionType: seed.siteRestrictionType,
        allowedSiteIds:
          seed.authorizedSiteKeys.length > 0
            ? seed.authorizedSiteKeys
                .map((k) => siteByKey[k]?.id)
                .filter((id): id is string => Boolean(id))
            : [],
      },
    });
    console.log(`✓ Profil synchronisé: ${spec.lastName}`);
  }

  console.log("Migration contraintes agents terminée.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
