import { z } from "zod";
import { parseDateKey } from "@/lib/planning/dates";

export const dayOfWeekSchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

export const shiftTypeSchema = z.enum(["DAY", "NIGHT", "CUSTOM", "OFF"]);

export const positionRoleSchema = z.enum(["TEAM_LEADER", "AGENT"]);

export const siteRestrictionTypeSchema = z.enum(["ONLY", "PREFERRED", "ANY"]);

export const agentSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  contractHours: z.coerce.number().int().min(1).max(200).optional().nullable(),
  overtimeAllowed: z.boolean().default(false),
  canWorkNight: z.boolean().default(true),
  isTeamLeader: z.boolean().default(false),
  maxVacationsPerMonth: z.coerce.number().int().min(0).max(31).optional().nullable(),
  preferredDays: z.array(dayOfWeekSchema).default([]),
  dayOnly: z.boolean().default(false),
  nightForbidden: z.boolean().default(false),
  siteRestrictionType: siteRestrictionTypeSchema.default("ANY"),
  allowedSiteIds: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  notes: z.string().optional(),
  polyvalent: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.polyvalent) return;
  if (data.siteRestrictionType !== "ANY" && data.allowedSiteIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Sélectionnez au moins un site",
      path: ["allowedSiteIds"],
    });
  }
});

const optionalTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Format: HH:MM")
  .optional()
  .or(z.literal(""));

export const agentSiteRuleFormSchema = z.object({
  siteId: z.string().min(1, "Site requis"),
  ruleType: z.enum(["ONLY", "PREFERRED", "BLOCKED"]),
  allowedDays: z.array(dayOfWeekSchema).default([]),
  fixedStartTime: optionalTimeSchema,
  fixedEndTime: optionalTimeSchema,
  maxHours: z.union([z.literal(""), z.coerce.number().int().min(1).max(300)]).optional(),
  notes: z.string().optional(),
});

export const agentSiteRulesFormSchema = z.array(agentSiteRuleFormSchema);

export type AgentSiteRuleFormInput = z.infer<typeof agentSiteRuleFormSchema>;

export const siteSchema = z.object({
  name: z.string().min(1, "Site name is required"),
  address: z.string().optional(),
  client: z.string().optional(),
  active: z.boolean().default(true),
  notes: z.string().optional(),
});

export const siteRequirementSchema = z.object({
  siteId: z.string().min(1),
  label: z.string().optional(),
  days: z.array(dayOfWeekSchema).default([]),
  shiftType: shiftTypeSchema,
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Format: HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Format: HH:MM"),
  role: positionRoleSchema.default("AGENT"),
  agentCount: z.coerce.number().int().min(1).default(1),
  priority: z.coerce.number().int().default(0),
  active: z.boolean().default(true),
});

function toPlanningDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const key = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return parseDateKey(key);
  }
  return new Date(value as string);
}

export const assignmentSchema = z.object({
  planningMonthId: z.string().min(1),
  agentId: z.string().min(1),
  siteId: z.string().min(1),
  requirementId: z.string().optional(),
  date: z.preprocess(toPlanningDate, z.date()),
  shiftType: shiftTypeSchema,
  role: positionRoleSchema.default("AGENT"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  hours: z.coerce.number().optional(),
  notes: z.string().optional(),
});

export const vacationSchema = z.object({
  agentId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().optional(),
});

export const absenceSchema = z.object({
  agentId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.enum(["VACATION", "SICK_LEAVE", "PERSONAL", "TRAINING", "OTHER"]).default("OTHER"),
  notes: z.string().optional(),
});

export const medicalVisitSchema = z.object({
  agentId: z.string().min(1),
  date: z.coerce.date(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().optional(),
});

export const unavailableDateSchema = z.object({
  agentId: z.string().min(1),
  date: z.coerce.date(),
  reason: z.string().optional(),
});

export type AgentInput = z.infer<typeof agentSchema>;
export type SiteInput = z.infer<typeof siteSchema>;
export type SiteRequirementInput = z.infer<typeof siteRequirementSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type VacationInput = z.infer<typeof vacationSchema>;
export type AbsenceInput = z.infer<typeof absenceSchema>;
export type MedicalVisitInput = z.infer<typeof medicalVisitSchema>;
export type UnavailableDateInput = z.infer<typeof unavailableDateSchema>;
