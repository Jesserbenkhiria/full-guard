"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Agent, AgentSiteRule, DayOfWeek } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createAgent, getAgentById, updateAgent } from "@/actions/agents";
import {
  AgentSiteRulesEditor,
  createEmptySiteRule,
  siteRuleFromAgentRule,
  type SiteOption,
  type SiteRuleFormEntry,
} from "@/components/agents/agent-site-rules-editor";
import { ALL_DAYS, CONTRACT_HOURS_OPTIONS, DAY_LABELS_FULL } from "@/lib/constants";
import { fr } from "@/lib/i18n/fr";

type AgentFormSiteRule = {
  id: string;
  siteId?: string;
  ruleType: import("@prisma/client").AgentSiteRuleType;
  allowedDays: import("@prisma/client").DayOfWeek[];
  fixedStartTime: string | null;
  fixedEndTime: string | null;
  maxHours: number | null;
  notes: string | null;
  site?: { id?: string; name: string };
};

type AgentFormAgent = Agent & {
  siteRules?: AgentFormSiteRule[];
};

type AgentFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: AgentFormAgent | null;
  sites: SiteOption[];
};

function isPolyvalentAgent(agent?: AgentFormAgent | null): boolean {
  if (!agent) return true;
  if ((agent.siteRules?.length ?? 0) > 0) return false;
  return agent.siteRestrictionType === "ANY";
}

function buildSiteRulesFromAgent(agent?: AgentFormAgent | null): SiteRuleFormEntry[] {
  if (!agent?.siteRules?.length) return [];
  return agent.siteRules.map(siteRuleFromAgentRule);
}

function getInitialFormState(agent?: AgentFormAgent | null) {
  const polyvalent = isPolyvalentAgent(agent);
  return {
    firstName: agent?.firstName ?? "",
    lastName: agent?.lastName ?? "",
    phone: agent?.phone ?? "",
    email: agent?.email ?? "",
    maxVacationsPerMonth: String(agent?.maxVacationsPerMonth ?? 2),
    notes: agent?.notes ?? "",
    dayOnly: agent?.dayOnly ?? false,
    nightForbidden: agent?.nightForbidden ?? false,
    canWorkNight: agent?.canWorkNight ?? true,
    isTeamLeader: agent?.isTeamLeader ?? false,
    overtimeAllowed: agent?.overtimeAllowed ?? false,
    active: agent?.active ?? true,
    contractHours: String(agent?.contractHours ?? 156),
    preferredDays: (agent?.preferredDays ?? []) as DayOfWeek[],
    polyvalent,
    siteRules: buildSiteRulesFromAgent(agent),
  };
}

function formatActionError(error: string, fieldErrors?: Record<string, string[]>) {
  if (!fieldErrors) return error;
  const details = Object.values(fieldErrors).flat();
  return details.length > 0 ? details.join(" · ") : error;
}

function serializeSiteRules(rules: SiteRuleFormEntry[]) {
  return rules.map(({ siteId, ruleType, allowedDays, fixedStartTime, fixedEndTime, maxHours, notes }) => ({
    siteId,
    ruleType,
    allowedDays,
    fixedStartTime,
    fixedEndTime,
    maxHours,
    notes,
  }));
}

export function AgentFormDialog({ open, onOpenChange, agent, sites }: AgentFormDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formAgent, setFormAgent] = useState<AgentFormAgent | null>(null);

  const isEdit = Boolean(agent?.id);
  const editReady = !isEdit || Boolean(formAgent);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [maxVacationsPerMonth, setMaxVacationsPerMonth] = useState("2");
  const [notes, setNotes] = useState("");
  const [dayOnly, setDayOnly] = useState(false);
  const [nightForbidden, setNightForbidden] = useState(false);
  const [canWorkNight, setCanWorkNight] = useState(true);
  const [isTeamLeader, setIsTeamLeader] = useState(false);
  const [overtimeAllowed, setOvertimeAllowed] = useState(false);
  const [active, setActive] = useState(true);
  const [contractHours, setContractHours] = useState("156");
  const [preferredDays, setPreferredDays] = useState<DayOfWeek[]>([]);
  const [polyvalent, setPolyvalent] = useState(true);
  const [siteRules, setSiteRules] = useState<SiteRuleFormEntry[]>([]);

  useEffect(() => {
    if (!open) {
      setFormAgent(null);
      return;
    }

    if (!agent?.id) {
      setFormAgent(null);
      return;
    }

    let cancelled = false;
    getAgentById(agent.id)
      .then((full) => {
        if (!cancelled && full) {
          setFormAgent(full as AgentFormAgent);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Impossible de charger l'agent");
      });

    return () => {
      cancelled = true;
    };
  }, [open, agent?.id]);

  useEffect(() => {
    if (!open) return;
    if (isEdit && !formAgent) return;

    const initial = getInitialFormState(isEdit ? formAgent : null);
    setFirstName(initial.firstName);
    setLastName(initial.lastName);
    setPhone(initial.phone);
    setEmail(initial.email);
    setMaxVacationsPerMonth(initial.maxVacationsPerMonth);
    setNotes(initial.notes);
    setDayOnly(initial.dayOnly);
    setNightForbidden(initial.nightForbidden);
    setCanWorkNight(initial.canWorkNight);
    setIsTeamLeader(initial.isTeamLeader);
    setOvertimeAllowed(initial.overtimeAllowed);
    setActive(initial.active);
    setContractHours(initial.contractHours);
    setPreferredDays(initial.preferredDays);
    setPolyvalent(initial.polyvalent);
    setSiteRules(initial.siteRules);
  }, [open, isEdit, formAgent]);

  function toggleDay(day: DayOfWeek) {
    setPreferredDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handleDayOnlyChange(checked: boolean) {
    setDayOnly(checked);
    if (checked) {
      setCanWorkNight(false);
      setNightForbidden(true);
    }
  }

  function handleNightForbiddenChange(checked: boolean) {
    setNightForbidden(checked);
    if (checked) setCanWorkNight(false);
  }

  function handlePolyvalentChange(checked: boolean) {
    setPolyvalent(checked);
    if (checked) {
      setSiteRules([]);
    } else if (siteRules.length === 0) {
      const entry = createEmptySiteRule(sites, []);
      if (entry) setSiteRules([entry]);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!editReady) return;

    if (!polyvalent && siteRules.length === 0) {
      toast.error(fr.agents.siteRulesFormEmpty);
      return;
    }

    const formData = new FormData(e.currentTarget);

    formData.set("firstName", firstName);
    formData.set("lastName", lastName);
    formData.set("phone", phone);
    formData.set("email", email);
    formData.set("maxVacationsPerMonth", maxVacationsPerMonth);
    formData.set("notes", notes);
    formData.set("dayOnly", String(dayOnly));
    formData.set("nightForbidden", String(nightForbidden));
    formData.set("canWorkNight", String(canWorkNight));
    formData.set("isTeamLeader", String(isTeamLeader));
    formData.set("overtimeAllowed", String(overtimeAllowed));
    formData.set("active", String(active));
    formData.set("contractHours", contractHours);
    formData.set("polyvalent", String(polyvalent));
    formData.set("siteRulesJson", JSON.stringify(serializeSiteRules(polyvalent ? [] : siteRules)));
    preferredDays.forEach((d) => formData.append("preferredDays", d));

    startTransition(async () => {
      const result =
        isEdit && agent?.id
          ? await updateAgent(agent.id, formData)
          : await createAgent(formData);

      if (result.success) {
        toast.success(isEdit ? fr.agents.agentUpdated : fr.agents.agentCreated);
        onOpenChange(false);
        router.refresh();
        if (!isEdit && result.data?.id) {
          router.push(`/agents/${result.data.id}`);
        }
      } else {
        toast.error(formatActionError(result.error, result.fieldErrors));
      }
    });
  }

  const formKey = open ? (isEdit ? `edit-${formAgent?.id ?? "loading"}` : "new") : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl">
        {!editReady ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{fr.common.loading}</div>
        ) : (
        <form key={formKey} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? fr.agents.editAgent : fr.agents.addAgentForm}</DialogTitle>
            <DialogDescription>{fr.agents.formDesc}</DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{fr.agents.firstName}</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{fr.agents.lastName}</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">{fr.agents.phone}</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{fr.agents.email}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{fr.agents.contractHours}</Label>
                  <Select value={contractHours} onValueChange={(v) => v && setContractHours(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACT_HOURS_OPTIONS.map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {h}h
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxVacationsPerMonth">{fr.agents.maxVacations}</Label>
                  <Input
                    id="maxVacationsPerMonth"
                    name="maxVacationsPerMonth"
                    type="number"
                    min={0}
                    max={31}
                    value={maxVacationsPerMonth}
                    onChange={(e) => setMaxVacationsPerMonth(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium">{fr.agents.restrictions}</p>
                <div className="flex items-center justify-between">
                  <Label htmlFor="overtimeAllowed">{fr.agents.overtimeAllowed}</Label>
                  <Switch
                    id="overtimeAllowed"
                    checked={overtimeAllowed}
                    onCheckedChange={setOvertimeAllowed}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="dayOnly">{fr.agents.dayOnlyLabel}</Label>
                  <Switch id="dayOnly" checked={dayOnly} onCheckedChange={handleDayOnlyChange} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="nightForbidden">{fr.agents.nightForbidden}</Label>
                  <Switch
                    id="nightForbidden"
                    checked={nightForbidden}
                    onCheckedChange={handleNightForbiddenChange}
                  />
                </div>
                {!dayOnly && !nightForbidden && (
                  <div className="flex items-center justify-between">
                    <Label htmlFor="canWorkNight">{fr.agents.canWorkNight}</Label>
                    <Switch
                      id="canWorkNight"
                      checked={canWorkNight}
                      onCheckedChange={setCanWorkNight}
                    />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="isTeamLeader">{fr.agents.isTeamLeader}</Label>
                    <p className="text-xs text-muted-foreground">{fr.agents.isTeamLeaderHint}</p>
                  </div>
                  <Switch
                    id="isTeamLeader"
                    checked={isTeamLeader}
                    onCheckedChange={setIsTeamLeader}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="active">{fr.common.active}</Label>
                  <Switch id="active" checked={active} onCheckedChange={setActive} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{fr.agents.preferredDays}</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ALL_DAYS.map((day) => (
                    <label key={day} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={preferredDays.includes(day)}
                        onCheckedChange={() => toggleDay(day)}
                      />
                      {DAY_LABELS_FULL[day]}
                    </label>
                  ))}
                </div>
              </div>

              {sites.length > 0 && (
                <AgentSiteRulesEditor
                  sites={sites}
                  polyvalent={polyvalent}
                  onPolyvalentChange={handlePolyvalentChange}
                  rules={siteRules}
                  onRulesChange={setSiteRules}
                />
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">{fr.common.notes}</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {fr.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? fr.common.saving : isEdit ? fr.agents.saveChanges : fr.agents.createAgent}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
