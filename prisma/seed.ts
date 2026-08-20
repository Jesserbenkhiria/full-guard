import {
  PrismaClient,
  DayOfWeek,
  ShiftType,
  PositionRole,
  PlanningStatus,
  AlertSeverity,
  AbsenceReason,
  SiteRestrictionType,
  type Agent,
  type Site,
} from "@prisma/client";
import { seedAgentSiteRules } from "./seed-agent-site-rules";
import {
  AGENT_CONSTRAINTS,
  constraintToAgentSeed,
} from "../src/data/agent-constraints";

const prisma = new PrismaClient();

const WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
];

const MON_SAT: DayOfWeek[] = [...WEEKDAYS, DayOfWeek.SATURDAY];
const ALL_DAYS: DayOfWeek[] = [...MON_SAT, DayOfWeek.SUNDAY];

function d(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

type AgentSeed = {
  firstName: string;
  lastName: string;
  contractHours?: number | null;
  overtimeAllowed?: boolean;
  canWorkNight?: boolean;
  maxVacationsPerMonth?: number | null;
  preferredDays?: DayOfWeek[];
  dayOnly?: boolean;
  nightForbidden?: boolean;
  isTeamLeader?: boolean;
  notes?: string;
  siteRestrictionType?: SiteRestrictionType;
  authorizedSiteKeys?: string[];
};

const AGENT_SEEDS: AgentSeed[] = AGENT_CONSTRAINTS.map(constraintToAgentSeed);

const RULES = [
  {
    code: "CONTRACT_HOURS_EXCEEDED",
    name: "Heures contractuelles dépassées",
    description: "L'agent dépasse ses heures mensuelles contractuelles",
    severity: AlertSeverity.ERROR,
    category: "hours",
  },
  {
    code: "OVERTIME_NOT_ALLOWED",
    name: "Heures sup. non autorisées",
    description: "Affectation au-delà du contrat sans autorisation d'heures sup.",
    severity: AlertSeverity.ERROR,
    category: "hours",
  },
  {
    code: "OVERTIME_WARNING",
    name: "Heures sup. autorisées",
    description: "L'agent dépasse son contrat mais les heures sup. sont autorisées",
    severity: AlertSeverity.WARNING,
    category: "hours",
  },
  {
    code: "VACATION_CONFLICT",
    name: "Conflit de congés",
    description: "Agent affecté pendant une période de congés",
    severity: AlertSeverity.ERROR,
    category: "availability",
  },
  {
    code: "MEDICAL_CONFLICT",
    name: "Conflit rendez-vous médical",
    description: "Agent affecté pendant une visite médicale",
    severity: AlertSeverity.ERROR,
    category: "availability",
  },
  {
    code: "ABSENCE_CONFLICT",
    name: "Conflit absence",
    description: "Agent affecté pendant une période d'absence",
    severity: AlertSeverity.ERROR,
    category: "availability",
  },
  {
    code: "UNAVAILABLE_DATE",
    name: "Date indisponible",
    description: "Agent marqué indisponible à cette date",
    severity: AlertSeverity.ERROR,
    category: "availability",
  },
  {
    code: "DOUBLE_ASSIGNMENT",
    name: "Double affectation",
    description: "Agent affecté à plusieurs postes le même jour",
    severity: AlertSeverity.ERROR,
    category: "scheduling",
  },
  {
    code: "OVERLAPPING_SHIFT",
    name: "Chevauchement de postes",
    description: "Les horaires se chevauchent avec une autre affectation",
    severity: AlertSeverity.ERROR,
    category: "scheduling",
  },
  {
    code: "NIGHT_FORBIDDEN",
    name: "Travail de nuit interdit",
    description: "L'agent ne peut pas travailler de nuit",
    severity: AlertSeverity.ERROR,
    category: "restrictions",
  },
  {
    code: "DAY_ONLY_RESTRICTION",
    name: "Restriction jour uniquement",
    description: "L'agent est limité aux postes de jour",
    severity: AlertSeverity.ERROR,
    category: "restrictions",
  },
  {
    code: "MAX_VACATIONS",
    name: "Maximum de congés dépassé",
    description: "L'agent dépasse le nombre max de congés par mois",
    severity: AlertSeverity.ERROR,
    category: "availability",
  },
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
  {
    code: "SITE_DAY_NOT_ALLOWED",
    name: "Jour non autorisé sur le site",
    description: "L'agent ne peut travailler ce jour sur ce site",
    severity: AlertSeverity.ERROR,
    category: "restrictions",
  },
  {
    code: "FIXED_START_TIME_MISMATCH",
    name: "Heure de début non conforme",
    description: "L'heure de début ne correspond pas au profil site",
    severity: AlertSeverity.ERROR,
    category: "restrictions",
  },
  {
    code: "FIXED_END_TIME_MISMATCH",
    name: "Heure de fin non conforme",
    description: "L'heure de fin ne correspond pas au profil site",
    severity: AlertSeverity.WARNING,
    category: "restrictions",
  },
  {
    code: "CANNOT_WORK_NIGHT",
    name: "Nuit non autorisée (profil)",
    description: "L'agent ne peut pas travailler de nuit selon son profil",
    severity: AlertSeverity.ERROR,
    category: "restrictions",
  },
  {
    code: "POSITION_ROLE_MISMATCH",
    name: "Poste / rôle incompatible",
    description: "Le rôle requis ne correspond pas au profil agent",
    severity: AlertSeverity.ERROR,
    category: "scheduling",
  },
  {
    code: "MAX_CONSECUTIVE_WORK_DAYS",
    name: "Jours travaillés consécutifs",
    description: "Maximum de 4 jours travaillés consécutifs dépassé",
    severity: AlertSeverity.ERROR,
    category: "scheduling",
  },
  {
    code: "DAY_NIGHT_TRANSITION",
    name: "Transition jour/nuit",
    description: "Enchaînement jour/nuit interdit",
    severity: AlertSeverity.ERROR,
    category: "scheduling",
  },
  {
    code: "MAX_WEEKENDS",
    name: "Maximum week-ends",
    description: "Maximum de 2 week-ends travaillés par mois dépassé",
    severity: AlertSeverity.WARNING,
    category: "scheduling",
  },
  {
    code: "SITE_MAX_HOURS",
    name: "Maximum heures site",
    description: "Heures maximales sur un site dépassées",
    severity: AlertSeverity.ERROR,
    category: "hours",
  },
  {
    code: "SITE_COVERAGE_MISSING",
    name: "Postes non couverts",
    description: "Des postes requis ne sont pas affectés",
    severity: AlertSeverity.ERROR,
    category: "validation",
  },
  {
    code: "PLANNING_VALIDATED",
    name: "Planning validé",
    description: "Affectation conforme aux règles métier",
    severity: AlertSeverity.SUCCESS,
    category: "validation",
  },
];

const VISAGE_SHIFTS: { date: string; start: string; end: string }[] = [
  { date: "2026-09-13", start: "09:30", end: "17:30" },
  { date: "2026-09-14", start: "18:00", end: "22:30" },
  { date: "2026-09-15", start: "17:00", end: "22:30" },
  { date: "2026-09-16", start: "18:00", end: "22:30" },
  { date: "2026-09-17", start: "18:00", end: "22:30" },
  { date: "2026-09-18", start: "18:00", end: "22:30" },
  { date: "2026-09-27", start: "12:30", end: "18:30" },
  { date: "2026-09-28", start: "18:00", end: "23:00" },
  { date: "2026-09-29", start: "17:00", end: "23:00" },
  { date: "2026-09-30", start: "18:00", end: "23:00" },
];

async function main() {
  console.log("🌱 Initialisation de la base Guard...");

  await prisma.alert.deleteMany();
  await prisma.document.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.planningMonth.deleteMany();
  await prisma.unavailableDate.deleteMany();
  await prisma.medicalVisit.deleteMany();
  await prisma.absence.deleteMany();
  await prisma.vacation.deleteMany();
  await prisma.siteRequirement.deleteMany();
  await prisma.agentSiteRule.deleteMany();
  await prisma.site.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      email: "admin@guard.local",
      name: "Administrateur",
      role: "ADMIN",
    },
  });

  for (const rule of RULES) {
    await prisma.rule.create({ data: rule });
  }

  const lesGemeaux = await prisma.site.create({
    data: {
      name: "Les Gémeaux - Mairie de Cergy",
      address: "Rue des Gémeaux, 95800 Cergy",
      client: "ASL Les Gémeaux",
      active: true,
      shiftDurationHours: 12,
      notes: "Vacation type 12h — postes jour 07h-19h, nuit 19h-07h",
      requirements: {
        create: [
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
        ],
      },
    },
  });

  const ordinal = await prisma.site.create({
    data: {
      name: "ORDINAL",
      address: "12 Rue des Chauffours, 95000 Cergy",
      client: "SDC ORDINAL",
      active: true,
      requirements: {
        create: [
          {
            label: "Lamine CAMARA — lun-ven",
            days: WEEKDAYS,
            shiftType: ShiftType.CUSTOM,
            startTime: "10:00",
            endTime: "17:00",
            agentCount: 1,
            priority: 2,
          },
          {
            label: "Oumar CAMARA — sam-dim",
            days: [DayOfWeek.SATURDAY, DayOfWeek.SUNDAY],
            shiftType: ShiftType.CUSTOM,
            startTime: "08:00",
            endTime: "20:00",
            agentCount: 1,
            priority: 2,
          },
        ],
      },
    },
  });

  const leDouze = await prisma.site.create({
    data: {
      name: "LE DOUZE",
      client: "LE DOUZE",
      active: true,
      notes: "Agents privilégiés : DJONKA, KAID, MBODJI",
      requirements: {
        create: [
          {
            label: "Poste standard",
            days: ALL_DAYS,
            shiftType: ShiftType.CUSTOM,
            startTime: "08:45",
            endTime: "19:30",
            agentCount: 1,
            priority: 1,
          },
        ],
      },
    },
  });

  const pleyel = await prisma.site.create({
    data: {
      name: "PLEYEL",
      client: "ETOILE PLEYEL 2",
      active: true,
      notes: "Agents privilégiés : DALIGOU, ZAMBA, OUMBA — exigences variables",
      requirements: {
        create: [
          {
            label: "Poste jour",
            days: ALL_DAYS,
            shiftType: ShiftType.DAY,
            startTime: "08:00",
            endTime: "20:00",
            agentCount: 1,
            priority: 1,
          },
          {
            label: "Poste nuit",
            days: ALL_DAYS,
            shiftType: ShiftType.NIGHT,
            startTime: "18:30",
            endTime: "08:30",
            agentCount: 1,
            priority: 1,
          },
        ],
      },
    },
  });

  const visageDuMonde = await prisma.site.create({
    data: {
      name: "VISAGE DU MONDE",
      client: "VISAGE DU MONDE",
      active: true,
      notes: "Exigences variables importées du client — septembre 2026",
      requirements: {
        create: VISAGE_SHIFTS.map((shift) => ({
          label: `Import ${shift.date.slice(8, 10)}/${shift.date.slice(5, 7)}`,
          days: [],
          shiftType: ShiftType.CUSTOM,
          startTime: shift.start,
          endTime: shift.end,
          agentCount: 1,
          priority: 0,
          specificDate: d(shift.date),
        })),
      },
    },
  });

  const siteByKey: Record<string, Site> = {
    GEMEAUX: lesGemeaux,
    ORDINAL: ordinal,
    "LE DOUZE": leDouze,
    PLEYEL: pleyel,
    VISAGE: visageDuMonde,
  };

  const agents = new Map<string, Agent>();

  const agentKey = (firstName: string, lastName: string) =>
    firstName.trim() ? `${firstName.trim()}_${lastName}` : lastName;

  for (const seed of AGENT_SEEDS) {
    const siteRestrictionType = seed.siteRestrictionType ?? SiteRestrictionType.ANY;
    const allowedIds =
      siteRestrictionType === SiteRestrictionType.ANY
        ? []
        : (seed.authorizedSiteKeys
            ?.map((key) => siteByKey[key]?.id)
            .filter((id): id is string => Boolean(id)) ?? []);

    const agent = await prisma.agent.create({
      data: {
        firstName: seed.firstName.trim() || seed.lastName,
        lastName: seed.lastName,
        contractHours: seed.contractHours ?? null,
        overtimeAllowed: seed.overtimeAllowed ?? false,
        canWorkNight: seed.canWorkNight ?? !(seed.dayOnly || seed.nightForbidden),
        isTeamLeader: seed.isTeamLeader ?? false,
        dayOnly: seed.dayOnly ?? false,
        nightForbidden: seed.nightForbidden ?? false,
        maxVacationsPerMonth: seed.maxVacationsPerMonth ?? null,
        preferredDays: seed.preferredDays ?? [],
        siteRestrictionType,
        allowedSiteIds: allowedIds,
        active: true,
        notes: seed.notes,
      },
    });
    agents.set(agentKey(seed.firstName, seed.lastName), agent);
  }

  await seedAgentSiteRules(prisma, agents, siteByKey);

  const getAgent = (lastName: string, firstName = "") => {
    const key = agentKey(firstName, lastName);
    let agent = agents.get(key);
    if (!agent && !firstName) {
      const matches = [...agents.values()].filter((a) => a.lastName === lastName);
      if (matches.length === 1) agent = matches[0];
    }
    if (!agent) throw new Error(`Agent introuvable: ${key}`);
    return agent;
  };

  // Vacations (congés)
  const vacations = [
    { agent: "LAJIMI", startDate: "2026-07-27", endDate: "2026-08-24" },
    { agent: "YAHMADI", startDate: "2026-08-01", endDate: "2026-08-20" },
    { agent: "DORCE", startDate: "2026-09-01", endDate: "2026-10-15" },
    { agent: "EVINA", startDate: "2026-09-14", endDate: "2026-10-01" },
  ];

  for (const v of vacations) {
    await prisma.vacation.create({
      data: {
        agentId: getAgent(v.agent).id,
        startDate: d(v.startDate),
        endDate: d(v.endDate),
        reason: "Congés",
      },
    });
  }

  // Also store as absences for unified availability views
  for (const v of vacations) {
    await prisma.absence.create({
      data: {
        agentId: getAgent(v.agent).id,
        startDate: d(v.startDate),
        endDate: d(v.endDate),
        reason: AbsenceReason.VACATION,
        notes: "Seed — congés",
      },
    });
  }

  // Medical visit
  await prisma.medicalVisit.create({
    data: {
      agentId: getAgent("ZAMBA").id,
      date: d("2026-09-02"),
      time: "14:45",
      notes: "Visite médicale planifiée",
    },
  });

  // Planning months — août & septembre 2026 (mois de test)
  const planningAugust = await prisma.planningMonth.create({
    data: {
      year: 2026,
      month: 8,
      status: PlanningStatus.IN_REVIEW,
      notes: "Planning août 2026 — données de démonstration",
    },
  });

  const planningSeptember = await prisma.planningMonth.create({
    data: {
      year: 2026,
      month: 9,
      status: PlanningStatus.DRAFT,
      notes: "Planning septembre 2026 — Visage du Monde & congés",
    },
  });

  // ─── Demo assignments & alerts ─────────────────────────────────────────────

  // 1. HOUNGUES — poste nuit interdit
  const hounguesNight = await prisma.assignment.create({
    data: {
      planningMonthId: planningAugust.id,
      agentId: getAgent("HOUNGUES").id,
      siteId: lesGemeaux.id,
      date: d("2026-08-15"),
      shiftType: ShiftType.NIGHT,
      startTime: "19:00",
      endTime: "07:00",
      hours: 12,
      notes: "Démo — poste nuit interdit",
    },
  });

  await prisma.alert.create({
    data: {
      planningMonthId: planningAugust.id,
      agentId: getAgent("HOUNGUES").id,
      siteId: lesGemeaux.id,
      assignmentId: hounguesNight.id,
      ruleCode: "NIGHT_FORBIDDEN",
      severity: AlertSeverity.ERROR,
      message: "HOUNGUES — travail de nuit interdit (jour uniquement)",
    },
  });

  // 2. EVINA — congés en septembre
  const evinaConflict = await prisma.assignment.create({
    data: {
      planningMonthId: planningSeptember.id,
      agentId: getAgent("EVINA").id,
      siteId: visageDuMonde.id,
      date: d("2026-09-20"),
      shiftType: ShiftType.CUSTOM,
      startTime: "18:00",
      endTime: "22:30",
      hours: 4.5,
      notes: "Démo — agent en congés",
    },
  });

  await prisma.alert.create({
    data: {
      planningMonthId: planningSeptember.id,
      agentId: getAgent("EVINA").id,
      siteId: visageDuMonde.id,
      assignmentId: evinaConflict.id,
      ruleCode: "VACATION_CONFLICT",
      severity: AlertSeverity.ERROR,
      message: "EVINA — agent indisponible (congés du 14/09 au 01/10/2026)",
    },
  });

  // 3. DJEDIA — heures sup. autorisées (>156h en août)
  const djediaShifts = [
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
    "2026-08-18",
    "2026-08-19",
    "2026-08-20",
    "2026-08-21",
  ];

  for (const dateStr of djediaShifts) {
    await prisma.assignment.create({
      data: {
        planningMonthId: planningAugust.id,
        agentId: getAgent("DJEDIA").id,
        siteId: lesGemeaux.id,
        date: d(dateStr),
        shiftType: ShiftType.DAY,
        startTime: "07:00",
        endTime: "19:00",
        hours: 12,
      },
    });
  }

  await prisma.alert.create({
    data: {
      planningMonthId: planningAugust.id,
      agentId: getAgent("DJEDIA").id,
      siteId: lesGemeaux.id,
      ruleCode: "OVERTIME_WARNING",
      severity: AlertSeverity.WARNING,
      message: "DJEDIA — 168h planifiées en août (contrat 156h, heures sup. autorisées)",
    },
  });

  // 4. DIAKITE — double affectation / chevauchement
  await prisma.assignment.create({
    data: {
      planningMonthId: planningAugust.id,
      agentId: getAgent("DIAKITE").id,
      siteId: lesGemeaux.id,
      date: d("2026-08-10"),
      shiftType: ShiftType.DAY,
      startTime: "07:00",
      endTime: "19:00",
      hours: 12,
    },
  });

  const diakiteB = await prisma.assignment.create({
    data: {
      planningMonthId: planningAugust.id,
      agentId: getAgent("DIAKITE").id,
      siteId: pleyel.id,
      date: d("2026-08-10"),
      shiftType: ShiftType.DAY,
      startTime: "08:00",
      endTime: "20:00",
      hours: 12,
      notes: "Démo — chevauchement",
    },
  });

  await prisma.alert.create({
    data: {
      planningMonthId: planningAugust.id,
      agentId: getAgent("DIAKITE").id,
      assignmentId: diakiteB.id,
      ruleCode: "OVERLAPPING_SHIFT",
      severity: AlertSeverity.ERROR,
      message: "DIAKITE — chevauchement entre Les Gémeaux et PLEYEL le 10/08/2026",
    },
  });

  await prisma.alert.create({
    data: {
      planningMonthId: planningAugust.id,
      agentId: getAgent("DIAKITE").id,
      assignmentId: diakiteB.id,
      ruleCode: "DOUBLE_ASSIGNMENT",
      severity: AlertSeverity.ERROR,
      message: "DIAKITE — double affectation le 10/08/2026",
    },
  });

  // 5. Planning Les Gémeaux valide — semaine du 04/08 au 10/08
  const validAgents = {
    day: [getAgent("SEITI"), getAgent("DEMBELE"), getAgent("YAHMADI")],
    night: getAgent("DJONKA"),
  };

  const validWeek = ["2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"];

  for (const dateStr of validWeek) {
    for (const agent of validAgents.day) {
      const assignment = await prisma.assignment.create({
        data: {
          planningMonthId: planningAugust.id,
          agentId: agent.id,
          siteId: lesGemeaux.id,
          date: d(dateStr),
          shiftType: ShiftType.DAY,
          startTime: "07:00",
          endTime: "19:00",
          hours: 12,
          notes: "Planning validé — couverture jour",
        },
      });

      await prisma.alert.create({
        data: {
          planningMonthId: planningAugust.id,
          agentId: agent.id,
          siteId: lesGemeaux.id,
          assignmentId: assignment.id,
          ruleCode: "PLANNING_VALIDATED",
          severity: AlertSeverity.SUCCESS,
          message: `${agent.lastName} — affectation jour Les Gémeaux validée`,
        },
      });
    }

    const nightAssignment = await prisma.assignment.create({
      data: {
        planningMonthId: planningAugust.id,
        agentId: validAgents.night.id,
        siteId: lesGemeaux.id,
        date: d(dateStr),
        shiftType: ShiftType.NIGHT,
        startTime: "19:00",
        endTime: "07:00",
        hours: 12,
        notes: "Planning validé — couverture nuit",
      },
    });

    await prisma.alert.create({
      data: {
        planningMonthId: planningAugust.id,
        agentId: validAgents.night.id,
        siteId: lesGemeaux.id,
        assignmentId: nightAssignment.id,
        ruleCode: "PLANNING_VALIDATED",
        severity: AlertSeverity.SUCCESS,
        message: "DJONKA — affectation nuit Les Gémeaux validée",
      },
    });
  }

  // ORDINAL — affectations fixes
  for (const dateStr of ["2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"]) {
    await prisma.assignment.create({
      data: {
        planningMonthId: planningAugust.id,
        agentId: getAgent("CAMARA", "Lamine").id,
        siteId: ordinal.id,
        date: d(dateStr),
        shiftType: ShiftType.CUSTOM,
        startTime: "10:00",
        endTime: "17:00",
        hours: 7,
        notes: "Lamine CAMARA — ORDINAL lun-ven",
      },
    });
  }

  await prisma.assignment.create({
    data: {
      planningMonthId: planningAugust.id,
      agentId: getAgent("CAMARA", "Oumar").id,
      siteId: ordinal.id,
      date: d("2026-08-09"),
      shiftType: ShiftType.CUSTOM,
      startTime: "08:00",
      endTime: "20:00",
      hours: 12,
      notes: "Oumar CAMARA — ORDINAL sam-dim",
    },
  });

  // ZAMBA — conflit médical en septembre
  await prisma.alert.create({
    data: {
      planningMonthId: planningSeptember.id,
      agentId: getAgent("ZAMBA").id,
      siteId: pleyel.id,
      ruleCode: "MEDICAL_CONFLICT",
      severity: AlertSeverity.WARNING,
      message: "ZAMBA — rendez-vous médical le 02/09/2026 à 14:45",
    },
  });

  console.log(`
✅ Seed terminé :
   • ${AGENT_SEEDS.length} agents
   • ${Object.keys(siteByKey).length} sites
   • ${RULES.length} règles
   • ${vacations.length} congés + 1 visite médicale
   • 2 mois de planification (août & sept. 2026)
   • Affectations de démonstration + alertes de test
  `);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
