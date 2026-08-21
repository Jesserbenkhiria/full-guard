/**
 * Import August 2026 reference planning from prisma/data/august-2026-import.json
 * Run extract first: python prisma/scripts/extract-august-planning.py
 * Then: npx tsx prisma/import-august-reference.ts
 */
import { PrismaClient, ShiftType, PositionRole } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { calculateShiftHours } from "../src/lib/planning/hours";
import {
  buildReferenceStats,
  formatReferenceProfileSummary,
} from "../src/services/planning/reference-stats";
import { formatAgentName } from "../src/lib/constants";

const prisma = new PrismaClient();

type ImportRow = {
  date: string;
  siteKey: string;
  agentKey: string;
  startTime: string;
  endTime: string;
  shiftType: string;
};

type ImportPayload = {
  year: number;
  month: number;
  assignments: ImportRow[];
};

const SITE_KEY_ALIASES: Record<string, string> = {
  GEMEAUX: "GEMEAUX",
  ORDINAL: "ORDINAL",
  "LE DOUZE": "LE DOUZE",
  PLEYEL: "PLEYEL",
  VISAGE: "VISAGE",
};

function agentLookupKey(firstName: string, lastName: string): string {
  return firstName.trim() ? `${firstName.trim()}_${lastName}` : lastName;
}

async function main() {
  const jsonPath = join(__dirname, "data", "august-2026-import.json");
  const payload = JSON.parse(readFileSync(jsonPath, "utf-8")) as ImportPayload;

  const sites = await prisma.site.findMany();
  const siteByKey = new Map<string, (typeof sites)[0]>();
  for (const site of sites) {
    if (site.name.includes("Gémeaux")) siteByKey.set("GEMEAUX", site);
    else if (site.name === "ORDINAL") siteByKey.set("ORDINAL", site);
    else if (site.name === "LE DOUZE") siteByKey.set("LE DOUZE", site);
    else if (site.name === "PLEYEL") siteByKey.set("PLEYEL", site);
    else if (site.name === "VISAGE DU MONDE") siteByKey.set("VISAGE", site);
  }

  const agents = await prisma.agent.findMany();
  const agentByKey = new Map<string, (typeof agents)[0]>();
  for (const agent of agents) {
    agentByKey.set(agentLookupKey(agent.firstName, agent.lastName), agent);
    agentByKey.set(agent.lastName, agent);
  }

  const extraAliases: Record<string, string> = {
    AOUFI: "Mohammed_AOUFI",
    Mohammed_AOUFI: "Mohammed_AOUFI",
    SEITI: "Jeannot_SEITI",
    DJONKA: "DJONKA",
    DJEDIA: "Dahmen_DJEDIA",
    DIAKITE: "Ibrahim Khalil_DIAKITE",
    DEMBELE: "Ramata_DEMBELE",
    HOUNGUES: "Evelyne_HOUNGUES",
    EVINA: "Pierre Marie_EVINA",
    LAJIMI: "Mohamed_LAJIMI",
    YAHMADI: "YAHMADI",
    DORCE: "Marcelus_DORCE",
    KAID: "Yacine_KAID",
    MBODJI: "MBODJI",
    CAMARA: "Oumar_CAMARA",
    Lamine_CAMARA: "Lamine_CAMARA",
    Oumar_CAMARA: "Oumar_CAMARA",
    Gnagno_DALIGOU: "Gnagno_DALIGOU",
    Georges_ZAMBA: "Georges_ZAMBA",
    Cyrille_OUMBA: "Cyrille_OUMBA",
    Marcelus_DORCE: "Marcelus_DORCE",
  };

  function resolveAgent(key: string) {
    const alias = extraAliases[key] ?? key;
    return agentByKey.get(alias) ?? agentByKey.get(key);
  }

  await prisma.planningMonth.updateMany({
    where: { isReference: true },
    data: { isReference: false },
  });

  let planningMonth = await prisma.planningMonth.findUnique({
    where: { year_month: { year: payload.year, month: payload.month } },
  });

  if (planningMonth) {
    await prisma.assignment.deleteMany({ where: { planningMonthId: planningMonth.id } });
    planningMonth = await prisma.planningMonth.update({
      where: { id: planningMonth.id },
      data: {
        isReference: true,
        status: "VALIDATED",
        notes: "Mois de référence — import FILES AOUT (août 2026)",
      },
    });
  } else {
    planningMonth = await prisma.planningMonth.create({
      data: {
        year: payload.year,
        month: payload.month,
        isReference: true,
        status: "VALIDATED",
        notes: "Mois de référence — import FILES AOUT (août 2026)",
      },
    });
  }

  let imported = 0;
  const skipped: string[] = [];

  for (const row of payload.assignments) {
    const site = siteByKey.get(SITE_KEY_ALIASES[row.siteKey] ?? row.siteKey);
    const agent = resolveAgent(row.agentKey);
    if (!site || !agent) {
      skipped.push(`${row.date} ${row.siteKey}/${row.agentKey}`);
      continue;
    }

    const shiftType = row.shiftType as ShiftType;
    const hours = calculateShiftHours(row.startTime, row.endTime);

    await prisma.assignment.create({
      data: {
        planningMonthId: planningMonth.id,
        agentId: agent.id,
        siteId: site.id,
        date: new Date(`${row.date}T12:00:00.000Z`),
        shiftType,
        role: PositionRole.AGENT,
        startTime: row.startTime,
        endTime: row.endTime,
        hours,
        notes: "Import référence août 2026",
      },
    });
    imported++;
  }

  const refAssignments = await prisma.assignment.findMany({
    where: { planningMonthId: planningMonth.id },
    select: {
      agentId: true,
      siteId: true,
      date: true,
      startTime: true,
      endTime: true,
      shiftType: true,
      hours: true,
    },
  });

  const stats = buildReferenceStats(
    planningMonth.id,
    payload.year,
    payload.month,
    refAssignments
  );

  const siteNames = new Map(sites.map((s) => [s.id, s.name]));

  console.log(`\n✓ Référence août ${payload.year} — ${imported} affectations importées`);
  if (skipped.length) console.log(`⚠ ${skipped.length} lignes ignorées (agent/site introuvable)`);

  console.log("\nProfils dérivés (mois de référence):");
  for (const agent of agents) {
    const profile = stats.profiles.get(agent.id);
    if (!profile) continue;
    console.log(
      `  • ${formatAgentName(agent.firstName, agent.lastName)}: ${formatReferenceProfileSummary(profile, siteNames)}`
    );
  }

  console.log("\n→ Les suggestions auto-fill utilisent ces profils comme poids soft.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
