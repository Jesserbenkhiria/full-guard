/**
 * Gémeaux oct. 2026 — renfort ciblé : un 3e agent de jour sur 5 dates.
 *
 * Sur 01, 05, 12, 19 et 26 oct. on crée deux postes à date fixe qui
 * remplacent les postes récurrents 07h–19h de ces journées :
 *   - AGENT       07h–19h ×3  (au lieu de ×2)
 *   - TEAM_LEADER 07h–19h ×1  (inchangé, mais recréé car un poste à date
 *     fixe masque tout poste récurrent chevauchant les mêmes horaires)
 * Les postes de nuit 19h–07h ne chevauchent pas et restent intacts.
 *
 * Puis KIBRI (01, 12, 19, 26) et DJEDIA (05) occupent les places créées.
 *
 * Run: npx tsx prisma/add-gemeaux-oct-renfort-jour.ts
 */
import { DayOfWeek, PositionRole, PrismaClient, ShiftType } from "@prisma/client";
import { calculateShiftHours } from "../src/lib/planning/hours";
import { getDayOfWeek, parseDateKey, toDateKey } from "../src/lib/planning/dates";

const prisma = new PrismaClient();

const RENFORT_DATES = ["2026-10-01", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
const START = "07:00";
const END = "19:00";

/** Qui occupe la place créée sur chaque date. */
const ASSIGNEES: Record<string, string> = {
  "2026-10-01": "KIBRI",
  "2026-10-05": "DJEDIA",
  "2026-10-12": "KIBRI",
  "2026-10-19": "KIBRI",
  "2026-10-26": "KIBRI",
};

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const gem = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!pm || !gem) {
    console.error("Mois ou site introuvable");
    process.exit(1);
  }

  console.log("1. Création des postes renfort (date fixe)");
  const agentReqByDate = new Map<string, string>();

  for (const dateKey of RENFORT_DATES) {
    const date = parseDateKey(dateKey);
    const day: DayOfWeek = getDayOfWeek(date);

    await prisma.siteRequirement.deleteMany({
      where: { siteId: gem.id, specificDate: date, startTime: START, endTime: END },
    });

    const agentReq = await prisma.siteRequirement.create({
      data: {
        siteId: gem.id,
        label: `Agents SSIAP 1 jour — renfort ${dateKey} (×3)`,
        days: [day],
        shiftType: ShiftType.DAY,
        startTime: START,
        endTime: END,
        role: PositionRole.AGENT,
        agentCount: 3,
        specificDate: date,
        active: true,
      },
    });
    agentReqByDate.set(dateKey, agentReq.id);

    const tlReq = await prisma.siteRequirement.create({
      data: {
        siteId: gem.id,
        label: `Chef de poste SSIAP 2 jour — ${dateKey}`,
        days: [day],
        shiftType: ShiftType.DAY,
        startTime: START,
        endTime: END,
        role: PositionRole.TEAM_LEADER,
        agentCount: 1,
        specificDate: date,
        active: true,
      },
    });

    // Les affectations existantes doivent pointer sur les nouveaux postes.
    const remapAgent = await prisma.assignment.updateMany({
      where: {
        planningMonthId: pm.id,
        siteId: gem.id,
        date,
        startTime: START,
        endTime: END,
        role: PositionRole.AGENT,
      },
      data: { requirementId: agentReq.id },
    });
    const remapTl = await prisma.assignment.updateMany({
      where: {
        planningMonthId: pm.id,
        siteId: gem.id,
        date,
        startTime: START,
        endTime: END,
        role: PositionRole.TEAM_LEADER,
      },
      data: { requirementId: tlReq.id },
    });

    console.log(
      `  ${dateKey} ${day.slice(0, 3)} — AGENT ×3 + CHEF ×1 (${remapAgent.count} agent(s) + ${remapTl.count} chef relié(s))`
    );
  }

  console.log("\n2. Affectation des places créées");
  const hours = calculateShiftHours(START, END);

  for (const dateKey of RENFORT_DATES) {
    const lastName = ASSIGNEES[dateKey]!;
    const ag = await prisma.agent.findFirst({
      where: { lastName: { equals: lastName, mode: "insensitive" } },
    });
    if (!ag) {
      console.log(`  ! ${lastName} introuvable`);
      continue;
    }

    const date = parseDateKey(dateKey);
    const already = await prisma.assignment.findFirst({
      where: { planningMonthId: pm.id, agentId: ag.id, date },
    });
    if (already) {
      console.log(`  ! ${lastName} déjà occupé le ${dateKey} — ignoré`);
      continue;
    }

    await prisma.assignment.create({
      data: {
        planningMonthId: pm.id,
        agentId: ag.id,
        siteId: gem.id,
        requirementId: agentReqByDate.get(dateKey)!,
        date,
        shiftType: ShiftType.DAY,
        role: PositionRole.AGENT,
        startTime: START,
        endTime: END,
        hours,
        notes: "renfort jour oct. 2026",
      },
    });
    console.log(`  + ${lastName}: ${dateKey} ${START}-${END} (${hours} h)`);
  }

  console.log("\n--- Bilan ---");
  const rows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: gem.id },
    include: { agent: true },
  });
  const byAgent = new Map<string, { n: number; h: number }>();
  for (const r of rows) {
    const ln = r.agent.lastName.toUpperCase();
    const s = byAgent.get(ln) ?? { n: 0, h: 0 };
    s.n++;
    s.h += r.hours ?? calculateShiftHours(r.startTime, r.endTime);
    byAgent.set(ln, s);
  }
  for (const [ln, s] of [...byAgent.entries()].sort((a, b) => b[1].h - a[1].h)) {
    console.log(`  ${ln.padEnd(10)} ${s.h.toFixed(1).padStart(6)} h  (${s.n} vac)`);
  }

  const kibriDates = rows
    .filter((r) => r.agent.lastName.toUpperCase() === "KIBRI")
    .map((r) => toDateKey(r.date))
    .sort();
  console.log(`\nKIBRI Gémeaux: ${kibriDates.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
