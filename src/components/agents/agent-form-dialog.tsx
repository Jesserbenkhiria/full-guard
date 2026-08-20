"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Agent, SiteRestrictionType } from "@prisma/client";
import {
  Dialog,
  DialogClose,
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
import { createAgent, updateAgent } from "@/actions/agents";
import { ALL_DAYS, CONTRACT_HOURS_OPTIONS, DAY_LABELS_FULL, SITE_RESTRICTION_LABELS } from "@/lib/constants";
import { fr } from "@/lib/i18n/fr";

type SiteOption = { id: string; name: string };

type AgentFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent | null;
  sites: SiteOption[];
};

export function AgentFormDialog({ open, onOpenChange, agent, sites }: AgentFormDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(agent);

  const [dayOnly, setDayOnly] = useState(agent?.dayOnly ?? false);
  const [nightForbidden, setNightForbidden] = useState(agent?.nightForbidden ?? false);
  const [canWorkNight, setCanWorkNight] = useState(agent?.canWorkNight ?? true);
  const [isTeamLeader, setIsTeamLeader] = useState(agent?.isTeamLeader ?? false);
  const [overtimeAllowed, setOvertimeAllowed] = useState(agent?.overtimeAllowed ?? false);
  const [active, setActive] = useState(agent?.active ?? true);
  const [contractHours, setContractHours] = useState(String(agent?.contractHours ?? 156));
  const [preferredDays, setPreferredDays] = useState<string[]>(agent?.preferredDays ?? []);
  const [siteRestrictionType, setSiteRestrictionType] = useState<SiteRestrictionType>(
    agent?.siteRestrictionType ?? "ANY"
  );
  const [allowedSiteIds, setAllowedSiteIds] = useState<string[]>(agent?.allowedSiteIds ?? []);

  function toggleDay(day: string) {
    setPreferredDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function toggleSite(siteId: string) {
    setAllowedSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
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

  function handleRestrictionTypeChange(value: SiteRestrictionType) {
    setSiteRestrictionType(value);
    if (value === "ANY") {
      setAllowedSiteIds([]);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    formData.set("dayOnly", String(dayOnly));
    formData.set("nightForbidden", String(nightForbidden));
    formData.set("canWorkNight", String(canWorkNight));
    formData.set("isTeamLeader", String(isTeamLeader));
    formData.set("overtimeAllowed", String(overtimeAllowed));
    formData.set("active", String(active));
    formData.set("contractHours", contractHours);
    formData.set("siteRestrictionType", siteRestrictionType);
    preferredDays.forEach((d) => formData.append("preferredDays", d));
    allowedSiteIds.forEach((id) => formData.append("allowedSiteIds", id));

    startTransition(async () => {
      const result = isEdit && agent
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
        toast.error(result.error);
      }
    });
  }

  const formKey = open ? (agent?.id ?? "new") : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? fr.agents.editAgent : fr.agents.addAgentForm}</DialogTitle>
          <DialogDescription>{fr.agents.formDesc}</DialogDescription>
        </DialogHeader>

        <ScrollArea key={formKey} className="max-h-[60vh] pr-4">
          <form id="agent-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">{fr.agents.firstName}</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  defaultValue={agent?.firstName}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{fr.agents.lastName}</Label>
                <Input id="lastName" name="lastName" defaultValue={agent?.lastName} required />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">{fr.agents.phone}</Label>
                <Input id="phone" name="phone" type="tel" defaultValue={agent?.phone ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{fr.agents.email}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={agent?.email ?? ""}
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
                  defaultValue={agent?.maxVacationsPerMonth ?? 2}
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
              <div className="space-y-3 rounded-lg border p-3">
                <div className="space-y-2">
                  <Label>{fr.agents.siteRestrictionType}</Label>
                  <Select
                    value={siteRestrictionType}
                    onValueChange={(value) =>
                      handleRestrictionTypeChange(value as SiteRestrictionType)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SITE_RESTRICTION_LABELS) as SiteRestrictionType[]).map(
                        (type) => (
                          <SelectItem key={type} value={type}>
                            {SITE_RESTRICTION_LABELS[type]}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {siteRestrictionType === "ANY" ? (
                  <p className="text-sm text-muted-foreground">{fr.agents.siteRestrictionAnyHint}</p>
                ) : (
                  <div className="space-y-2">
                    <Label>{fr.agents.siteRestrictionSites}</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {sites.map((site) => (
                        <label key={site.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={allowedSiteIds.includes(site.id)}
                            onCheckedChange={() => toggleSite(site.id)}
                          />
                          {site.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">{fr.common.notes}</Label>
              <Textarea id="notes" name="notes" defaultValue={agent?.notes ?? ""} rows={2} />
            </div>
          </form>
        </ScrollArea>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {fr.common.cancel}
          </DialogClose>
          <Button type="submit" form="agent-form" disabled={pending}>
            {pending ? fr.common.saving : isEdit ? fr.agents.saveChanges : fr.agents.createAgent}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
