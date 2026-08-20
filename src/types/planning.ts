import type { DayOfWeek, PlanningStatus, ShiftType, PositionRole } from "@prisma/client";

/** Recurring shift need for a site — maps to SiteRequirement in the database. */
export type ShiftTemplate = {
  id: string;
  siteId: string;
  label: string | null;
  days: DayOfWeek[];
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  agentCount: number;
  specificDate: string | null;
};

export type AssignmentAlertSummary = {
  id: string;
  ruleCode: string;
  severity: "ERROR" | "WARNING" | "SUCCESS";
  message: string;
};

export type PlanningAssignmentDto = {
  id: string;
  planningMonthId: string;
  agentId: string;
  agentName: string;
  siteId: string;
  siteName: string;
  requirementId: string | null;
  date: string;
  shiftType: ShiftType;
  role: PositionRole;
  startTime: string;
  endTime: string;
  hours: number | null;
  notes: string | null;
  aiGenerated?: boolean;
  aiConfidence?: number | null;
  aiExplanation?: string | null;
  alerts: AssignmentAlertSummary[];
  validationStatus: "valid" | "warning" | "error";
};

export type PlanningSlotDto = {
  id: string;
  siteId: string;
  requirementId: string;
  date: string;
  shiftType: ShiftType;
  role: PositionRole;
  startTime: string;
  endTime: string;
  slotIndex: number;
  requiredAgents: number;
  assignment: PlanningAssignmentDto | null;
};

export type SitePlanningGroup = {
  siteId: string;
  siteName: string;
  habitualAgents: string[];
  teamLeaderHints: string[];
  shiftRows: ShiftPlanningRow[];
};

export type ShiftPlanningRow = {
  requirementId: string;
  label: string;
  role: PositionRole;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  agentCount: number;
  slotsByDate: Record<string, PlanningSlotDto[]>;
};

export type AgentDayCell = {
  date: string;
  shiftType: ShiftType | null;
  siteName: string | null;
  assignmentId: string | null;
  startTime: string | null;
  endTime: string | null;
  validationStatus: "valid" | "warning" | "error" | "off";
  alertMessage: string | null;
};

export type AgentPlanningRow = {
  agentId: string;
  agentName: string;
  contractHours: number | null;
  overtimeAllowed: boolean;
  days: AgentDayCell[];
  totalHours: number;
  overtimeHours: number;
};

export type PlanningMonthDto = {
  id: string;
  year: number;
  month: number;
  status: PlanningStatus;
};

export type AgentSuggestion = {
  agentId: string;
  agentName: string;
  score: number;
  accepted: boolean;
  reasons: string[];
  reasonDetails: SuggestionReasonDetail[];
  aiGenerated?: boolean;
  aiExplanation?: string;
  aiConfidence?: number;
};

export type SuggestionReasonDetail = {
  text: string;
  type: "ok" | "warn" | "error";
};

export type PlanningSummary = {
  siteCount: number;
  totalSlots: number;
  filledSlots: number;
  missingSlots: number;
  alertCount: number;
};

export type UnfilledSlotPreview = {
  slotId: string;
  siteId: string;
  siteName: string;
  requirementId: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftType: ShiftType;
  role: PositionRole;
};

export type PlanningData = {
  planningMonth: PlanningMonthDto;
  days: string[];
  sites: SitePlanningGroup[];
  agents: AgentPlanningRow[];
  assignments: PlanningAssignmentDto[];
  agentOptions: { id: string; name: string }[];
  siteOptions: { id: string; name: string }[];
  summary: PlanningSummary;
  unfilledSlots: UnfilledSlotPreview[];
};
