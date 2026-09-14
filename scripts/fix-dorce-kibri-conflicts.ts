/**
 * Corrections ciblées octobre 2026 :
 *  1. DORCE : supprimer le doublon nuit du 31/10 sur Pleyel
 *  2. KIBRI  : supprimer les vacations Gémeaux aux dates où il est aussi à la Médiathèque
 *  3. KIBRI  : re-remplir Gémeaux jusqu'à 156 h sans conflit
 * Run: npx tsx scripts/fix-dorce-kibri-conflicts.ts
 */
import { PrismaClient, PositionRole, ShiftType } from "@prisma/client";
import { toDateKey, getDayOfWeek, parseDateKey } from "../src/lib/planning/dates";
import { calculateShiftHours } from "../src/lib/planning/hours";

const p = new PrismaClient();

const OCT_DAYS = Array.from({ length: 31 }, (_, i) =>
  `2026-10-${String(i + 1).padStart(2, "0")}`
);

async function main() {
  const pm = await p.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  if (!pm) { console.error("No PM oct 2026"); process.exit(1); }

  const [dorce, kibri] = await Promise.all([
    p.agent.findFirst({ where: { lastName: "DORCE" } }),
    p.agent.findFirst({ where: { lastName: "KIBRI" } }),
  ]);
  const pleyel = await p.site.findFirst({ where: { name: "PLEYEL" } });
  const gem = await p.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  const med = await p.site.findFirst({ where: { name: { contains: "Horloge" } } });

  if (!dorce || !kibri || !pleyel || !gem || !med) {
    console.error("Données manquantes"); process.exit(1);
  }

  // ── 1. DORCE Oct 31 : supprimer la vacation NUIT (garder le JOUR) ──────────
  const dorce31 = await p.assignment.findMany({
    where: {
      planningMonthId: pm.id,
      agentId: dorce.id,
      siteId: pleyel.id,
      date: new Date("2026-10-31T12:00:00.000Z"),
    },
    orderBy: { startTime: "asc" },
  });

  if (dorce31.length >= 2) {
    // Keep DAY (08:00-20:00), delete NIGHT (20:00-08:00)
    const nightShift = dorce31.find((a) => a.startTime >= "18:00");
    if (nightShift) {
      await p.assignment.delete({ where: { id: nightShift.id } });
      console.log(`✓ DORCE 31/10 : vacation nuit ${nightShift.startTime}-${nightShift.endTime} supprimée`);
    }
  } else {
    console.log("ℹ DORCE 31/10 : pas de doublon trouvé");
  }

  // ── 2. KIBRI : supprimer Gémeaux quand aussi à la Médiathèque le même jour ─
  const kibriAll = await p.assignment.findMany({
    where: { planningMonthId: pm.id, agentId: kibri.id },
    orderBy: { date: "asc" },
  });

  const kibriMedDates = new Set(
    kibriAll.filter((a) => a.siteId === med.id).map((a) => toDateKey(a.date))
  );
  const kibriGemConflicts = kibriAll.filter(
    (a) => a.siteId === gem.id && kibriMedDates.has(toDateKey(a.date))
  );

  if (kibriGemConflicts.length > 0) {
    await p.assignment.deleteMany({
      where: { id: { in: kibriGemConflicts.map((a) => a.id) } },
    });
    console.log(`✓ KIBRI : ${kibriGemConflicts.length} conflit(s) Gémeaux/Médiathèque supprimés`);
    for (const a of kibriGemConflicts) {
      console.log(`   Gémeaux supprimé : ${toDateKey(a.date)} ${a.startTime}-${a.endTime}`);
    }
  } else {
    console.log("ℹ KIBRI : pas de conflit Gémeaux/Médiathèque");
  }

  // ── 3. KIBRI : top-up Gémeaux sans conflit ────────────────────────────────
  const kibriUpdated = await p.assignment.findMany({
    where: { planningMonthId: pm.id, agentId: kibri.id },
  });
  let kibriH = kibriUpdated.reduce(
    (s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)),
    0
  );

  if (kibriH < 155) {
    const gemReqs = await p.siteRequirement.findMany({
      where: { siteId: gem.id, active: true, specificDate: null, role: PositionRole.AGENT, shiftType: ShiftType.DAY },
    });
    const gemExisting = await p.assignment.findMany({
      where: { planningMonthId: pm.id, siteId: gem.id },
    });
    const slotCount = new Map<string, number>();
    for (const a of gemExisting) {
      const k = `${toDateKey(a.date)}|${a.startTime}|${a.endTime}`;
      slotCount.set(k, (slotCount.get(k) ?? 0) + 1);
    }

    const kibriMedBusy = new Set(
      kibriUpdated.filter((a) => a.siteId === med.id).map((a) => toDateKey(a.date))
    );
    const kibriBusy = new Set(kibriUpdated.map((a) => toDateKey(a.date)));

    let created = 0;
    for (const dateKey of OCT_DAYS) {
      if (kibriH >= 156) break;
      if (kibriBusy.has(dateKey)) continue;
      if (kibriMedBusy.has(dateKey)) continue;

      const day = getDayOfWeek(parseDateKey(dateKey));
      for (const req of gemReqs) {
        if (!req.days.includes(day)) continue;
        const slotKey = `${dateKey}|${req.startTime}|${req.endTime}`;
        if ((slotCount.get(slotKey) ?? 0) >= req.agentCount) continue;
        const sh = calculateShiftHours(req.startTime, req.endTime);
        if (kibriH + sh > 156.5) continue;

        await p.assignment.create({
          data: {
            planningMonthId: pm.id,
            agentId: kibri.id,
            siteId: gem.id,
            requirementId: req.id,
            date: parseDateKey(dateKey),
            shiftType: ShiftType.DAY,
            role: PositionRole.AGENT,
            startTime: req.startTime,
            endTime: req.endTime,
            hours: sh,
            notes: "fix-kibri-gems",
          },
        });
        kibriH += sh;
        created++;
        kibriBusy.add(dateKey);
        slotCount.set(slotKey, (slotCount.get(slotKey) ?? 0) + 1);
        break;
      }
    }
    console.log(`✓ KIBRI : ${created} vacation(s) Gémeaux ajoutées → ${kibriH.toFixed(1)} h`);
  }

  // ── 4. Bilan ──────────────────────────────────────────────────────────────
  const allRows = await p.assignment.findMany({
    where: { planningMonthId: pm.id },
    include: { agent: true, site: true },
  });
  for (const name of ["DORCE", "KIBRI"]) {
    const list = allRows.filter((a) => a.agent.lastName.toUpperCase() === name);
    const h = list.reduce((s, a) => s + (a.hours ?? calculateShiftHours(a.startTime, a.endTime)), 0);
    const sites = [...new Set(list.map((a) => a.site.name.replace("Les Gémeaux - Mairie de Cergy", "Gémeaux").replace("Médiathèque de l'Horloge", "Méd.")))].join(" + ");
    console.log(`  ${name.padEnd(8)} ${h.toFixed(1).padStart(6)} h  (${list.length} vac)  ${sites}`);
    for (const a of list.sort((x, y) => toDateKey(x.date).localeCompare(toDateKey(y.date)))) {
      const siteLbl = a.site.name.includes("Gémeaux") ? "Gémeaux" : a.site.name.includes("Horloge") ? "Méd." : a.site.name;
      console.log(`    ${toDateKey(a.date)}  ${siteLbl.padEnd(8)}  ${a.startTime}-${a.endTime}`);
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
