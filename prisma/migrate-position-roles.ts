/**
 * Upgrade existing database: role is informational, Les Gémeaux merged postes.
 * Run: npx tsx prisma/migrate-position-roles.ts
 */
import { PrismaClient, PositionRole } from "@prisma/client";
import { GEMEAUX_REQUIREMENTS } from "./site-requirements-lajimi";

const prisma = new PrismaClient();

async function main() {
  const ruleUpdate = await prisma.rule.updateMany({
    where: { code: "POSITION_ROLE_MISMATCH" },
    data: {
      enabled: false,
      description: "Désactivé — le rôle chef d'équipe est informatif, pas bloquant",
    },
  });
  console.log("Règle POSITION_ROLE_MISMATCH désactivée:", ruleUpdate.count);

  const gemeaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux", mode: "insensitive" } },
  });

  if (gemeaux) {
    await prisma.siteRequirement.deleteMany({ where: { siteId: gemeaux.id } });
    await prisma.site.update({
      where: { id: gemeaux.id },
      data: {
        shiftDurationHours: 12,
        notes: "Vacation type 12h — postes jour 07h-19h, nuit 19h-07h. Chef d'équipe = rôle informatif.",
      },
    });
    await prisma.siteRequirement.createMany({
      data: GEMEAUX_REQUIREMENTS.map((req) => ({
        siteId: gemeaux.id,
        label: req.label,
        days: req.days,
        shiftType: req.shiftType,
        startTime: req.startTime,
        endTime: req.endTime,
        role: req.role ?? PositionRole.AGENT,
        agentCount: req.agentCount,
        priority: req.priority,
        active: true,
      })),
    });
    console.log(
      `Exigences Les Gémeaux mises à jour (${GEMEAUX_REQUIREMENTS.length} postes, spec Lajimi).`
    );
  } else {
    console.log("Site Les Gémeaux introuvable — exigences non modifiées.");
  }

  console.log("Migration terminée. Tout agent peut occuper n'importe quel créneau.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
