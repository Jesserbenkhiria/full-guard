import { getDefaultPlanningPeriod } from "@/services/planning/queries";
import { AlertsPageClient } from "@/components/alerts/alerts-page-client";
import { prisma } from "@/lib/db";
import { fr } from "@/lib/i18n/fr";

export const dynamic = "force-dynamic";

type AlertsPageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const params = await searchParams;
  const defaults = await getDefaultPlanningPeriod();
  const year = Number(params.year) || defaults.year;
  const month = Number(params.month) || defaults.month;

  let alerts: Awaited<
    ReturnType<
      typeof prisma.alert.findMany<{
        include: {
          agent: { select: { lastName: true; firstName: true } };
          site: { select: { name: true } };
          assignment: { select: { id: true } };
        };
      }>
    >
  > = [];

  try {
    alerts = await prisma.alert.findMany({
      where: {
        planningMonth: { year, month },
        resolved: false,
      },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      include: {
        agent: { select: { lastName: true, firstName: true } },
        site: { select: { name: true } },
        assignment: { select: { id: true } },
      },
    });
  } catch {
    alerts = [];
  }

  return (
    <AlertsPageClient
      alerts={alerts}
      year={year}
      month={month}
      title={fr.alerts.title}
      description={fr.alerts.description}
    />
  );
}
