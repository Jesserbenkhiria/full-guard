import { prisma } from "../src/lib/db";
import { toDateKey, getDayOfWeek } from "../src/lib/planning/dates";
import { DayOfWeek } from "@prisma/client";

const FRI_SAT_SUN = new Set([DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]);
const LAJIMI_D = new Set([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
]);
const DJEDIA_D = new Set([
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.SATURDAY,
]);
const WEEKEND = new Set([DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]);

function isNight(st: string, start: string, end: string) {
  return st === "NIGHT" || end < start;
}

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const gem = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const pleyel = await prisma.site.findFirst({ where: { name: "PLEYEL" } });
  if (!pm || !gem) return;

  const med = await prisma.site.findFirst({
    where: { OR: [{ name: { contains: "Horloge" } }, { name: { contains: "Médiath" } }] },
  });

  const rows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: gem.id },
    include: { agent: true },
  });

  const all = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id },
    include: { agent: true, site: true },
  });

  const errors: string[] = [];

  for (const a of rows) {
    const ln = a.agent.lastName.toUpperCase();
    const dk = toDateKey(a.date);
    const day = getDayOfWeek(a.date);
    const night = isNight(a.shiftType, a.startTime, a.endTime);

    if (ln === "LAJIMI" && (!LAJIMI_D.has(day) || night)) errors.push(`LAJIMI ${dk} interdit`);
    if (ln === "DJEDIA" && (!DJEDIA_D.has(day) || night)) {
      errors.push(`DJEDIA ${dk} interdit (lun–jeu + sam jour)`);
    }
    if (ln === "EVINA" && night) errors.push(`EVINA ${dk} nuit interdite`);
    if (ln === "DIAKITE") {
      if (!night) errors.push(`DIAKITE ${dk} doit être nuit`);
      if (dk >= "2026-10-19" && !FRI_SAT_SUN.has(day)) {
        errors.push(`DIAKITE ${dk} après 19/10 hors ven-sam-dim`);
      }
    }
    if (ln === "KIBRI" && med) {
      const onMed = all.some(
        (x) => x.agentId === a.agentId && x.siteId === med.id && toDateKey(x.date) === dk
      );
      if (onMed) errors.push(`KIBRI ${dk} doublon Gémeaux + Médiathèque`);
    }
    if (["DEMBELE", "SEITI", "HOUNGUES"].includes(ln) && night) errors.push(`${ln} ${dk} nuit interdite`);

    const pleyelSame = all.some(
      (x) =>
        x.agentId === a.agentId &&
        x.siteId === pleyel?.id &&
        toDateKey(x.date) === dk
    );
    if (ln === "DORCE" && pleyelSame) errors.push(`DORCE ${dk} conflit Pleyel/Gémeaux`);
  }

  const halidi = rows.filter((a) => a.agent.lastName.toUpperCase() === "HALIDI");
  if (halidi.length) errors.push(`HALIDI encore présent (${halidi.length})`);

  const aoufi = rows.filter((a) => a.agent.lastName.toUpperCase() === "AOUFI");
  if (aoufi.length) errors.push(`AOUFI encore présent sur Gémeaux (${aoufi.length})`);

  const managedNames = new Set([
    "LAJIMI", "DJEDIA", "DIAKITE", "DEMBELE", "SEITI", "HOUNGUES",
    "EVINA", "DORCE", "CHARGUI", "KIBRI",
  ]);
  const agentIds = [
    ...new Set(
      all.filter((a) => managedNames.has(a.agent.lastName.toUpperCase())).map((a) => a.agentId)
    ),
  ];
  for (const agentId of agentIds) {
    const dates = [...new Set(all.filter((a) => a.agentId === agentId).map((a) => toDateKey(a.date)))].sort();
    let run = 1;
    let maxRun = 1;
    for (let i = 1; i < dates.length; i++) {
      const a = new Date(dates[i - 1]! + "T12:00:00.000Z");
      const b = new Date(dates[i]! + "T12:00:00.000Z");
      const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000);
      if (diff === 1) {
        run++;
        maxRun = Math.max(maxRun, run);
      } else run = 1;
    }
    const name = all.find((a) => a.agentId === agentId)?.agent.lastName?.toUpperCase() ?? agentId;
    const cap = ["LAJIMI", "DJEDIA", "DIAKITE"].includes(name) ? 3 : 5;
    if (maxRun > cap) errors.push(`${name}: ${maxRun} jours consécutifs (>${cap})`);
  }

  console.log(errors.length ? errors.join("\n") : "✓ Aucune infraction détectée sur les règles client");
  if (errors.length) console.log(`Total: ${errors.length}`);

  const diakite = rows.filter((a) => a.agent.lastName.toUpperCase() === "DIAKITE");
  const after = diakite.filter((a) => toDateKey(a.date) >= "2026-10-19");
  console.log(`DIAKITE après 19/10: ${after.map((a) => toDateKey(a.date)).join(", ")}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
