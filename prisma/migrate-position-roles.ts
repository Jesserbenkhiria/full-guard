/**
 * Upgrade existing database for position roles without wiping planning data.
 * Run after `npx prisma db push`: npx tsx prisma/migrate-position-roles.ts
 */
import {
  PrismaClient,
  DayOfWeek,
  ShiftType,
  PositionRole,
} from "@prisma/client";

const prisma = new PrismaClient();

const WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

const GEMEAUX_REQUIREMENTS = [
  {
    label: "Chef d'équipe jour lun-ven",
    days: WEEKDAYS,
    shiftType: ShiftType.DAY,
    startTime: "07:00",
    endTime: "19:00",
    role: PositionRole.TEAM_LEADER,
    agentCount: 1,
    priority: 2,
  },
  {
    label: "Agents jour lun-ven (×2)",
    days: WEEKDAYS,
    shiftType: ShiftType.DAY,
    startTime: "07:00",
    endTime: "19:00",
    role: PositionRole.AGENT,
    agentCount: 2,
    priority: 1,
  },
  {
    label: "Agent nuit lun-ven",
    days: WEEKDAYS,
    shiftType: ShiftType.NIGHT,
    startTime: "19:00",
    endTime: "07:00",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Agent jour samedi 07h-19h",
    days: [DayOfWeek.SATURDAY],
    shiftType: ShiftType.DAY,
    startTime: "07:00",
    endTime: "19:00",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Chef d'équipe samedi 08h-17h45",
    days: [DayOfWeek.SATURDAY],
    shiftType: ShiftType.CUSTOM,
    startTime: "08:00",
    endTime: "17:45",
    role: PositionRole.TEAM_LEADER,
    agentCount: 1,
    priority: 2,
  },
  {
    label: "Agent samedi 08h-17h45",
    days: [DayOfWeek.SATURDAY],
    shiftType: ShiftType.CUSTOM,
    startTime: "08:00",
    endTime: "17:45",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Agent nuit samedi",
    days: [DayOfWeek.SATURDAY],
    shiftType: ShiftType.NIGHT,
    startTime: "19:00",
    endTime: "07:00",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Agent jour dimanche",
    days: [DayOfWeek.SUNDAY],
    shiftType: ShiftType.DAY,
    startTime: "07:00",
    endTime: "19:00",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
  {
    label: "Agent nuit dimanche",
    days: [DayOfWeek.SUNDAY],
    shiftType: ShiftType.NIGHT,
    startTime: "19:00",
    endTime: "07:00",
    role: PositionRole.AGENT,
    agentCount: 1,
    priority: 1,
  },
];

async function main() {
  const teamLeaders = await prisma.agent.updateMany({
    where: { lastName: { in: ["LAJIMI", "AOUFI"] } },
    data: { isTeamLeader: true },
  });
  console.log("Chefs d'équipe marqués:", teamLeaders.count);

  const gemeaux = await prisma.site.findFirst({
    where: { name: { contains: "Gémeaux", mode: "insensitive" } },
  });

  if (gemeaux) {
    await prisma.siteRequirement.deleteMany({ where: { siteId: gemeaux.id } });
    await prisma.site.update({
      where: { id: gemeaux.id },
      data: {
        shiftDurationHours: 12,
        notes: "Vacation type 12h — postes jour 07h-19h, nuit 19h-07h",
      },
    });
    await prisma.siteRequirement.createMany({
      data: GEMEAUX_REQUIREMENTS.map((req) => ({ ...req, siteId: gemeaux.id, active: true })),
    });
    console.log("Exigences Les Gémeaux mises à jour (9 postes avec rôles).");
  } else {
    console.log("Site Les Gémeaux introuvable — exigences non modifiées.");
  }

  console.log("Migration terminée. Les affectations existantes conservent role=AGENT par défaut.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
