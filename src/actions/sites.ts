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
import { siteRequirementSchema, siteSchema } from "@/lib/validations";
import { fr } from "@/lib/i18n/fr";

function parseSiteFormData(formData: FormData) {
  return siteSchema.parse({
    name: getString(formData, "name"),
    address: getOptionalString(formData, "address"),
    client: getOptionalString(formData, "client"),
    active: getBoolean(formData, "active"),
    notes: getOptionalString(formData, "notes"),
  });
}

function parseRequirementFormData(formData: FormData) {
  return siteRequirementSchema.parse({
    siteId: getString(formData, "siteId"),
    label: getOptionalString(formData, "label"),
    days: getStringArray(formData, "days"),
    shiftType: getString(formData, "shiftType"),
    startTime: getString(formData, "startTime"),
    endTime: getString(formData, "endTime"),
    role: getString(formData, "role") || undefined,
    agentCount: getString(formData, "agentCount"),
    priority: getString(formData, "priority") || "0",
    active: getBoolean(formData, "active"),
  });
}

export async function createSite(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseSiteFormData(formData);
    const site = await prisma.site.create({ data });
    revalidatePath("/sites");
    revalidatePath("/dashboard");
    revalidatePath("/agents");
    return success({ id: site.id });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return failure("Échec de la validation", formatZodErrors(issues));
    }
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return failure(fr.sites.nameExists);
    }
    return failure(err instanceof Error ? err.message : "Impossible de créer le site");
  }
}

export async function updateSite(
  id: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseSiteFormData(formData);
    const site = await prisma.site.update({ where: { id }, data });
    revalidatePath("/sites");
    revalidatePath(`/sites/${id}`);
    revalidatePath("/dashboard");
    return success({ id: site.id });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return failure("Échec de la validation", formatZodErrors(issues));
    }
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return failure(fr.sites.nameExists);
    }
    return failure(err instanceof Error ? err.message : "Impossible de mettre à jour le site");
  }
}

export async function deleteSite(id: string): Promise<ActionResult> {
  try {
    await prisma.site.delete({ where: { id } });
    revalidatePath("/sites");
    revalidatePath("/dashboard");
    return success(undefined);
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Impossible de supprimer le site");
  }
}

export async function createSiteRequirement(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseRequirementFormData(formData);
    const requirement = await prisma.siteRequirement.create({ data });
    revalidatePath(`/sites/${data.siteId}`);
    revalidatePath("/sites");
    return success({ id: requirement.id });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return failure("Échec de la validation", formatZodErrors(issues));
    }
    return failure(err instanceof Error ? err.message : "Impossible de créer l'exigence");
  }
}

export async function updateSiteRequirement(
  id: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseRequirementFormData(formData);
    const requirement = await prisma.siteRequirement.update({
      where: { id },
      data: {
        label: data.label,
        days: data.days,
        shiftType: data.shiftType,
        startTime: data.startTime,
        endTime: data.endTime,
        agentCount: data.agentCount,
        priority: data.priority,
        active: data.active,
      },
    });
    revalidatePath(`/sites/${data.siteId}`);
    revalidatePath("/sites");
    return success({ id: requirement.id });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return failure("Échec de la validation", formatZodErrors(issues));
    }
    return failure(err instanceof Error ? err.message : "Impossible de mettre à jour l'exigence");
  }
}

export async function deleteSiteRequirement(
  id: string,
  siteId: string
): Promise<ActionResult> {
  try {
    await prisma.siteRequirement.delete({ where: { id } });
    revalidatePath(`/sites/${siteId}`);
    revalidatePath("/sites");
    return success(undefined);
  } catch (err) {
    return failure(err instanceof Error ? err.message : "Impossible de supprimer l'exigence");
  }
}

export async function getSiteById(id: string) {
  return prisma.site.findUnique({
    where: { id },
    include: {
      requirements: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }] },
      agentRules: {
        where: { active: true },
        include: {
          agent: { select: { id: true, firstName: true, lastName: true, active: true } },
        },
        orderBy: [{ ruleType: "asc" }, { agent: { lastName: "asc" } }],
      },
    },
  });
}

export async function getSitesList() {
  return prisma.site.findMany({
    orderBy: { name: "asc" },
    include: { requirements: { where: { active: true } } },
  });
}
