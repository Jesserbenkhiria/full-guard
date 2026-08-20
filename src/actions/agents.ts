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
import type { AgentSiteRuleType, SiteRestrictionType } from "@prisma/client";
import {
  absenceSchema,
  agentSchema,
  agentSiteRulesFormSchema,
  type AgentSiteRuleFormInput,
  medicalVisitSchema,
  unavailableDateSchema,
  vacationSchema,
} from "@/lib/validations";

function parseSiteRulesJson(formData: FormData): AgentSiteRuleFormInput[] {
  const raw = formData.get("siteRulesJson");
  if (typeof raw !== "string" || !raw.trim()) return [];
  const parsed = JSON.parse(raw) as unknown;
  return agentSiteRulesFormSchema.parse(parsed);
}

function normalizeSiteRule(rule: AgentSiteRuleFormInput) {
  return {
    siteId: rule.siteId,
    ruleType: rule.ruleType as AgentSiteRuleType,
    allowedDays: rule.allowedDays,
    fixedStartTime: rule.fixedStartTime?.trim() || null,
    fixedEndTime: rule.fixedEndTime?.trim() || null,
    maxHours:
      rule.maxHours === "" || rule.maxHours == null ? null : Number(rule.maxHours),
    notes: rule.notes?.trim() || null,
    active: true,
  };
}

function deriveSiteAuthorization(
  polyvalent: boolean,
  siteRules: AgentSiteRuleFormInput[]
): { siteRestrictionType: SiteRestrictionType; allowedSiteIds: string[] } {
  if (polyvalent || siteRules.length === 0) {
    return { siteRestrictionType: "ANY", allowedSiteIds: [] };
  }

  const allowedSiteIds = [...new Set(siteRules.map((rule) => rule.siteId))];
  const hasOnly = siteRules.some((rule) => rule.ruleType === "ONLY");
  return {
    siteRestrictionType: hasOnly ? "ONLY" : "PREFERRED",
    allowedSiteIds,
  };
}

async function syncAgentSiteRules(agentId: string, siteRules: AgentSiteRuleFormInput[]) {
  const normalized = siteRules.map(normalizeSiteRule);
  const siteIds = normalized.map((rule) => rule.siteId);

  if (siteIds.length === 0) {
    await prisma.agentSiteRule.deleteMany({ where: { agentId } });
    return;
  }

  await prisma.agentSiteRule.deleteMany({
    where: {
      agentId,
      siteId: { notIn: siteIds },
    },
  });

  for (const rule of normalized) {
    await prisma.agentSiteRule.upsert({
      where: {
        agentId_siteId: {
          agentId,
          siteId: rule.siteId,
        },
      },
      create: {
        agentId,
        ...rule,
      },
      update: rule,
    });
  }
}

function parseAgentFormData(formData: FormData) {
  const dayOnly = getBoolean(formData, "dayOnly");
  const nightForbidden = getBoolean(formData, "nightForbidden");
  const polyvalent = getBoolean(formData, "polyvalent");
  const siteRules = parseSiteRulesJson(formData);
  const { siteRestrictionType, allowedSiteIds } = deriveSiteAuthorization(polyvalent, siteRules);

  if (!polyvalent && siteRules.length === 0) {
    throw new Error("Ajoutez au moins un profil site ou activez le mode polyvalent");
  }

  const duplicateSites = siteRules.map((rule) => rule.siteId);
  if (new Set(duplicateSites).size !== duplicateSites.length) {
    throw new Error("Chaque site ne peut apparaître qu'une seule fois dans les profils");
  }

  const parsed = agentSchema.parse({
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
      siteRestrictionType,
      allowedSiteIds,
      active: getBoolean(formData, "active"),
      notes: getOptionalString(formData, "notes"),
      polyvalent,
    });
  const { polyvalent: _polyvalent, ...agentData } = parsed;

  return {
    agentData,
    siteRules,
  };
}

export async function createAgent(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const { agentData, siteRules } = parseAgentFormData(formData);
    const agent = await prisma.agent.create({ data: agentData });
    await syncAgentSiteRules(agent.id, siteRules);
    revalidatePath("/agents");
    revalidatePath("/dashboard");
    revalidatePath("/planning");
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
    const { agentData, siteRules } = parseAgentFormData(formData);
    const agent = await prisma.agent.update({ where: { id }, data: agentData });
    await syncAgentSiteRules(agent.id, siteRules);
    revalidatePath("/agents");
    revalidatePath(`/agents/${id}`);
    revalidatePath("/dashboard");
    revalidatePath("/planning");
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
