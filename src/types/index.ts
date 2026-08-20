export type RuleSeverity = "INFO" | "WARNING" | "ERROR";

export type RuleResult = {
  valid: boolean;
  severity: RuleSeverity;
  ruleCode: string;
  message: string;
};

export type SuggestionResult = {
  agentId: string;
  agentName: string;
  score: number;
  accepted: boolean;
  reasons: string[];
};

export type DashboardStats = {
  totalAgents: number;
  totalSites: number;
  activeAgents: number;
  activeSites: number;
  planningStatus: string;
  errorCount: number;
  warningCount: number;
  missingAssignments: number;
};

export type NavItem = {
  title: string;
  href: string;
  icon: string;
  badge?: number;
};
