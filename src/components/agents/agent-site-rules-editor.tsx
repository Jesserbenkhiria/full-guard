"use client";

import { Plus, Trash2 } from "lucide-react";
import type { AgentSiteRuleType, DayOfWeek } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AGENT_SITE_RULE_LABELS, ALL_DAYS, DAY_LABELS_FULL } from "@/lib/constants";
import { fr } from "@/lib/i18n/fr";

export type SiteOption = { id: string; name: string };

export type SiteRuleFormEntry = {
  key: string;
  siteId: string;
  ruleType: AgentSiteRuleType;
  allowedDays: DayOfWeek[];
  fixedStartTime: string;
  fixedEndTime: string;
  maxHours: string;
  notes: string;
};

type AgentSiteRulesEditorProps = {
  sites: SiteOption[];
  polyvalent: boolean;
  onPolyvalentChange: (value: boolean) => void;
  rules: SiteRuleFormEntry[];
  onRulesChange: (rules: SiteRuleFormEntry[]) => void;
};

export function createEmptySiteRule(sites: SiteOption[], usedSiteIds: string[]): SiteRuleFormEntry | null {
  const site = sites.find((s) => !usedSiteIds.includes(s.id));
  if (!site) return null;
  return {
    key: `${site.id}-${Date.now()}`,
    siteId: site.id,
    ruleType: "ONLY",
    allowedDays: [],
    fixedStartTime: "",
    fixedEndTime: "",
    maxHours: "",
    notes: "",
  };
}

export function siteRuleFromAgentRule(rule: {
  id: string;
  siteId?: string;
  ruleType: AgentSiteRuleType;
  allowedDays: DayOfWeek[];
  fixedStartTime: string | null;
  fixedEndTime: string | null;
  maxHours: number | null;
  notes: string | null;
  site?: { id?: string; name: string };
}): SiteRuleFormEntry {
  return {
    key: rule.id,
    siteId: rule.siteId ?? rule.site?.id ?? "",
    ruleType: rule.ruleType,
    allowedDays: rule.allowedDays ?? [],
    fixedStartTime: rule.fixedStartTime ?? "",
    fixedEndTime: rule.fixedEndTime ?? "",
    maxHours: rule.maxHours != null ? String(rule.maxHours) : "",
    notes: rule.notes ?? "",
  };
}

export function AgentSiteRulesEditor({
  sites,
  polyvalent,
  onPolyvalentChange,
  rules,
  onRulesChange,
}: AgentSiteRulesEditorProps) {
  function updateRule(key: string, patch: Partial<SiteRuleFormEntry>) {
    onRulesChange(rules.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)));
  }

  function removeRule(key: string) {
    onRulesChange(rules.filter((rule) => rule.key !== key));
  }

  function addRule() {
    const entry = createEmptySiteRule(
      sites,
      rules.map((r) => r.siteId)
    );
    if (entry) onRulesChange([...rules, entry]);
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{fr.agents.siteRulesFormTitle}</p>
          <p className="text-xs text-muted-foreground">{fr.agents.siteRulesFormHint}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="polyvalent-toggle" className="text-xs text-muted-foreground">
            {fr.agents.polyvalentMode}
          </Label>
          <Switch
            id="polyvalent-toggle"
            checked={polyvalent}
            onCheckedChange={onPolyvalentChange}
          />
        </div>
      </div>

      {!polyvalent && (
        <div className="space-y-3">
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground">{fr.agents.siteRulesFormEmpty}</p>
          )}

          {rules.map((rule) => {
            const siteName = sites.find((s) => s.id === rule.siteId)?.name ?? "—";
            return (
              <div key={rule.key} className="space-y-3 rounded-md border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{siteName}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeRule(rule.key)}
                    aria-label={fr.agents.removeSiteRule}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{fr.planning.site}</Label>
                    <Select
                      value={rule.siteId}
                      onValueChange={(value) => value && updateRule(rule.key, { siteId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map((site) => (
                          <SelectItem
                            key={site.id}
                            value={site.id}
                            disabled={rules.some((r) => r.siteId === site.id && r.key !== rule.key)}
                          >
                            {site.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{fr.agents.siteRestrictionType}</Label>
                    <Select
                      value={rule.ruleType}
                      onValueChange={(value) =>
                        value && updateRule(rule.key, { ruleType: value as AgentSiteRuleType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["ONLY", "PREFERRED", "BLOCKED"] as AgentSiteRuleType[]).map((type) => (
                          <SelectItem key={type} value={type}>
                            {AGENT_SITE_RULE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{fr.agents.allowedDays}</Label>
                  <p className="text-xs text-muted-foreground">{fr.agents.siteRuleDaysHint}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {ALL_DAYS.map((day) => (
                      <label key={day} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={rule.allowedDays.includes(day)}
                          onCheckedChange={() => {
                            const next = rule.allowedDays.includes(day)
                              ? rule.allowedDays.filter((d) => d !== day)
                              : [...rule.allowedDays, day];
                            updateRule(rule.key, { allowedDays: next });
                          }}
                        />
                        {DAY_LABELS_FULL[day]}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor={`fixed-start-${rule.key}`}>{fr.agents.fixedStart}</Label>
                    <Input
                      id={`fixed-start-${rule.key}`}
                      type="time"
                      value={rule.fixedStartTime}
                      onChange={(e) => updateRule(rule.key, { fixedStartTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`fixed-end-${rule.key}`}>{fr.agents.fixedEnd}</Label>
                    <Input
                      id={`fixed-end-${rule.key}`}
                      type="time"
                      value={rule.fixedEndTime}
                      onChange={(e) => updateRule(rule.key, { fixedEndTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`max-hours-${rule.key}`}>{fr.agents.maxHoursSite}</Label>
                    <Input
                      id={`max-hours-${rule.key}`}
                      type="number"
                      min={1}
                      max={300}
                      placeholder="—"
                      value={rule.maxHours}
                      onChange={(e) => updateRule(rule.key, { maxHours: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`rule-notes-${rule.key}`}>{fr.common.notes}</Label>
                  <Textarea
                    id={`rule-notes-${rule.key}`}
                    rows={2}
                    value={rule.notes}
                    onChange={(e) => updateRule(rule.key, { notes: e.target.value })}
                  />
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRule}
            disabled={rules.length >= sites.length}
          >
            <Plus className="mr-2 size-4" />
            {fr.agents.addSiteRule}
          </Button>
        </div>
      )}
    </div>
  );
}
