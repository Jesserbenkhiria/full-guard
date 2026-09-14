import { getPlanningData } from "../src/services/planning/queries";
import { computeSiteCoverage } from "../src/lib/planning/summary";

async function main() {
  const month = Number(process.argv[2] ?? 10);
  const data = await getPlanningData(2026, month);
  const site = data.sites.find((s) => s.siteName.includes("Gémeaux"));
  if (!site) {
    console.log("Gémeaux not found");
    return;
  }
  const c = computeSiteCoverage(site);
  console.log(`Gémeaux ${month}/2026 UI: ${c.filled}/${c.total} (${c.missing} vacants)`);
  console.log(`Global summary: ${data.summary.filledSlots}/${data.summary.totalSlots}`);
}

main().catch(console.error);
