import { PositionRole, PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/planning/dates";
import {
  isRequirementSupersededOnDate,
  requirementAppliesOnDate,
  toShiftTemplate,
} from "../src/lib/planning/shift-templates";

const prisma = new PrismaClient();
const OCT = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

const isNight = (s: string, e: string) => e < s;

async function main() {
  const pm = await prisma.planningMonth.findFirst({ where: { year: 2026, month: 10 } });
  const g = await prisma.site.findFirst({ where: { name: { contains: "Gémeaux" } } });
  if (!pm || !g) return;

  const reqs = await prisma.siteRequirement.findMany({ where: { siteId: g.id, active: true } });
  const templates = reqs.map((r) => ({ ...toShiftTemplate(r), _req: r }));

  const rows = await prisma.assignment.findMany({
    where: { planningMonthId: pm.id, siteId: g.id },
  });
  const filled = new Map<string, number>();
  for (const a of rows) {
    const k = `${toDateKey(a.date)}|${a.startTime}|${a.endTime}|${a.role}`;
    filled.set(k, (filled.get(k) ?? 0) + 1);
  }

  let required = 0;
  let taken = 0;
  const gaps: { kind: string; line: string }[] = [];

  for (const dateKey of OCT) {
    const date = new Date(`${dateKey}T00:00:00`);
    for (const t of templates) {
      if (!requirementAppliesOnDate(t, date)) continue;
      if (isRequirementSupersededOnDate(t, dateKey, templates)) continue;
      const role = t._req.role ?? PositionRole.AGENT;
      const k = `${dateKey}|${t.startTime}|${t.endTime}|${role}`;
      required += t.agentCount;
      const n = Math.min(filled.get(k) ?? 0, t.agentCount);
      taken += n;
      const gap = t.agentCount - (filled.get(k) ?? 0);
      if (gap > 0) {
        const kind =
          role === PositionRole.TEAM_LEADER
            ? "CHEF"
            : isNight(t.startTime, t.endTime)
              ? "NUIT"
              : "JOUR";
        gaps.push({
          kind,
          line: `  ${dateKey} ${t.startTime}-${t.endTime} ${kind} → ${gap} vacant`,
        });
      }
    }
  }

  console.log(`Gémeaux oct. 2026 — ${taken}/${required} postes pourvus\n`);
  for (const kind of ["JOUR", "CHEF", "NUIT"]) {
    const list = gaps.filter((x) => x.kind === kind);
    console.log(`${kind} — ${list.reduce((s) => s + 1, 0)} poste(s) vacant(s)`);
    for (const x of list) console.log(x.line);
  }
}

main().finally(() => prisma.$disconnect());
