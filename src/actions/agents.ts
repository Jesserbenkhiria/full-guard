"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  failure,
  formatZodErrors,
  getBoolean,
  getOptionalString,
  getString,
  getStringArray,
  success,
  type ActionResult,
} from "@/lib/actions";
import {
  absenceSchema,
  agentSchema,
  medicalVisitSchema,
  unavailableDateSchema,
  vacationSchema,
} from "@/lib/validations";

function parseAgentFormData(formData: FormData) {
  const dayOnly = getBoolean(formData, "dayOnly");
  const nightForbidden = getBoolean(formData, "nightForbidden");

  return agentSchema.parse({
    firstName: getString(formData, "firstName"),
    lastName: getString(formData, "lastName"),
    phone: getOptionalString(formData, "phone"),
    email: getString(formData, "email"),
    contractHours: getString(formData, "contractHours") || undefined,
    overtimeAllowed: getBoolean(formData, "overtimeAllowed"),
    canWorkNight: dayOnly || nightForbidden ? false : getBoolean(formData, "canWorkNight"),
    maxVacationsPerMonth: getString(formData, "maxVacationsPerMonth") || undefined,
    preferredDays: getStringArray(formData, "preferredDays"),
    dayOnly,
    nightForbidden,
    isTeamLeader: getBoolean(formData, "isTeamLeader"),
    siteRestrictionType: getString(formData, "siteRestrictionType") || "ANY",
    allowedSiteIds: getStringArray(formData, "allowedSiteIds"),
    active: getBoolean(formData, "active"),
    notes: getOptionalString(formData, "notes"),
  });
}

export async function createAgent(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseAgentFormData(formData);
    const agent = await prisma.agent.create({ data });
    revalidatePath("/agents");
    revalidatePath("/dashboard");
    return success({ id: agent.id });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return failure("Échec de la validation", formatZodErrors(issues));
    }
    return failure(err instanceof Error ? err.message : "Impossible de créer l'agent");
  }
}

export async function updateAgent(
  id: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseAgentFormData(formData);
    const agent = await prisma.agent.update({ where: { id }, data });
    revalidatePath("/agents");
    revalidatePath(`/agents/${id}`);
    revalidatePath("/dashboard");
    return success({ id: agent.id });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return failure("Échec de la validation", formatZodErrors(issues));
    }
    return failure(err instanceof Error ? err.message : "Impossible de mettre à jour l'agent");
  }
}

export async function deleteAgent(id: string): Promise<ActionResult> {
  try {
    await prisma.agent.delete({ where: { id } });
    revalidatePath("/agents");
    revalidatePath("/dashboard");
    return success(undefined);
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Impossible de supprimer l'agent");
  }
}

export async function createVacation(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = vacationSchema.parse({
      agentId: getString(formData, "agentId"),
      startDate: getString(formData, "startDate"),
      endDate: getString(formData, "endDate"),
      reason: getOptionalString(formData, "reason"),
    });

    if (parsed.endDate < parsed.startDate) {
      return failure("La date de fin doit être après la date de début");
    }

    const vacation = await prisma.vacation.create({ data: parsed });
    revalidatePath(`/agents/${parsed.agentId}`);
    return success({ id: vacation.id });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return failure("Échec de la validation", formatZodErrors(issues));
    }
    return failure(err instanceof Error ? err.message : "Impossible de créer le congé");
  }
}

export async function deleteVacation(id: string, agentId: string): Promise<ActionResult> {
  try {
    await prisma.vacation.delete({ where: { id } });
    revalidatePath(`/agents/${agentId}`);
    return success(undefined);
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Impossible de supprimer le congé");
  }
}

export async function createAbsence(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = absenceSchema.parse({
      agentId: getString(formData, "agentId"),
      startDate: getString(formData, "startDate"),
      endDate: getString(formData, "endDate"),
      reason: getString(formData, "reason") || "OTHER",
      notes: getOptionalString(formData, "notes"),
    });

    if (parsed.endDate < parsed.startDate) {
      return failure("La date de fin doit être après la date de début");
    }

    const absence = await prisma.absence.create({ data: parsed });
    revalidatePath(`/agents/${parsed.agentId}`);
    return success({ id: absence.id });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return failure("Échec de la validation", formatZodErrors(issues));
    }
    return failure(err instanceof Error ? err.message : "Impossible de créer l'absence");
  }
}

export async function deleteAbsence(id: string, agentId: string): Promise<ActionResult> {
  try {
    await prisma.absence.delete({ where: { id } });
    revalidatePath(`/agents/${agentId}`);
    return success(undefined);
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Impossible de supprimer l'absence");
  }
}

export async function createMedicalVisit(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = medicalVisitSchema.parse({
      agentId: getString(formData, "agentId"),
      date: getString(formData, "date"),
      time: getString(formData, "time"),
      notes: getOptionalString(formData, "notes"),
    });

    const visit = await prisma.medicalVisit.create({ data: parsed });
    revalidatePath(`/agents/${parsed.agentId}`);
    return success({ id: visit.id });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return failure("Échec de la validation", formatZodErrors(issues));
    }
    return failure(err instanceof Error ? err.message : "Impossible de créer la visite médicale");
  }
}

export async function deleteMedicalVisit(id: string, agentId: string): Promise<ActionResult> {
  try {
    await prisma.medicalVisit.delete({ where: { id } });
    revalidatePath(`/agents/${agentId}`);
    return success(undefined);
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Impossible de supprimer la visite médicale");
  }
}

export async function createUnavailableDate(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = unavailableDateSchema.parse({
      agentId: getString(formData, "agentId"),
      date: getString(formData, "date"),
      reason: getOptionalString(formData, "reason"),
    });

    const record = await prisma.unavailableDate.create({ data: parsed });
    revalidatePath(`/agents/${parsed.agentId}`);
    return success({ id: record.id });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return failure("Échec de la validation", formatZodErrors(issues));
    }
    return failure(err instanceof Error ? err.message : "Impossible d'ajouter la date indisponible");
  }
}

export async function deleteUnavailableDate(
  id: string,
  agentId: string
): Promise<ActionResult> {
  try {
    await prisma.unavailableDate.delete({ where: { id } });
    revalidatePath(`/agents/${agentId}`);
    return success(undefined);
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Impossible de supprimer la date indisponible");
  }
}

export async function getAgentById(id: string) {
  return prisma.agent.findUnique({
    where: { id },
    include: {
      siteRules: {
        where: { active: true },
        include: { site: { select: { id: true, name: true } } },
        orderBy: { site: { name: "asc" } },
      },
      vacations: { orderBy: { startDate: "desc" } },
      absences: { orderBy: { startDate: "desc" } },
      medicalVisits: { orderBy: { date: "desc" } },
      unavailableDates: { orderBy: { date: "desc" } },
    },
  });
}

export async function getAgentsList() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return prisma.agent.findMany({
    orderBy: { lastName: "asc" },
    include: {
      siteRules: {
        where: { active: true },
        include: { site: { select: { id: true, name: true } } },
        orderBy: { site: { name: "asc" } },
      },
      vacations: {
        where: {
          startDate: { lt: end },
          endDate: { gte: start },
        },
        select: { id: true },
        take: 1,
      },
      medicalVisits: {
        where: {
          date: { gte: start, lt: end },
        },
        select: { id: true },
        take: 1,
      },
      unavailableDates: {
        where: {
          date: { gte: start, lt: end },
        },
        select: { id: true },
        take: 1,
      },
    },
  });
}

export async function getSitesForSelect() {
  return prisma.site.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
