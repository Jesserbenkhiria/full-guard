import { z } from "zod";

export const aiSuggestionItemSchema = z.object({
  agentId: z.string(),
  score: z.number().min(0).max(100),
  reasoning: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const aiSuggestionResponseSchema = z.object({
  suggestions: z.array(aiSuggestionItemSchema),
});

export type AiSuggestionItem = z.infer<typeof aiSuggestionItemSchema>;
export type AiSuggestionResponse = z.infer<typeof aiSuggestionResponseSchema>;

export type VacationRequirementContext = {
  site: { id: string; name: string };
  date: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  role: string;
  shiftHours: number;
};

export type AgentCandidateContext = {
  agentId: string;
  name: string;
  contractHours: number | null;
  remainingHours: number | null;
  assignmentCount: number;
  siteAssignmentCount: number;
  allowedSites: string[];
  siteRules: {
    siteName: string;
    ruleType: string;
    allowedDays: string[];
    fixedStartTime: string | null;
    fixedEndTime: string | null;
    maxHours: number | null;
  }[];
  restrictions: {
    canWorkNight: boolean;
    dayOnly: boolean;
    nightForbidden: boolean;
    overtimeAllowed: boolean;
    preferredDays: string[];
  };
  availability: {
    onVacation: boolean;
    onAbsence: boolean;
    medicalVisit: boolean;
    unavailable: boolean;
  };
  previousAssignments: {
    date: string;
    siteName: string;
    startTime: string;
    endTime: string;
  }[];
  engineFitScore: number;
  rankingSignals: {
    preferredDay: boolean | null;
    weekendWeeksUsed: number;
    consecutiveDaysIfAssigned: number;
    restHours: number | null;
    assignmentCount: number;
    workedHours: number;
    fairnessDeltaHours: number;
    contractUtilization: number | null;
  };
};

export type PlanningAssistantContext = {
  requirement: VacationRequirementContext;
  candidates: AgentCandidateContext[];
  activeRules: { code: string; name: string; description: string | null }[];
};

export type ValidatedAiSuggestion = {
  agentId: string;
  agentName: string;
  score: number;
  accepted: boolean;
  reasoning: string[];
  warnings: string[];
  aiExplanation: string;
  ruleFailures: string[];
};

export type AutoAssignResult = {
  success: boolean;
  assignmentId?: string;
  agentName?: string;
  aiExplanation?: string;
  aiConfidence?: number;
  error?: string;
};

export type MonthlyPlanningResult = {
  applied: number;
  skipped: number;
  errors: string[];
  assignments: {
    slotId: string;
    siteName: string;
    date: string;
    agentName?: string;
    aiExplanation?: string;
    success: boolean;
    error?: string;
  }[];
};
