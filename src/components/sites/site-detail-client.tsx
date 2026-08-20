"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import type { AgentSiteRule, Site, SiteRequirement } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteFormDialog } from "@/components/sites/site-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  createSiteRequirement,
  deleteSiteRequirement,
  updateSiteRequirement,
} from "@/actions/sites";
import { ALL_DAYS, DAY_LABELS_FULL, formatDays, SHIFT_TYPE_LABELS, POSITION_ROLE_LABELS } from "@/lib/constants";
import { fr } from "@/lib/i18n/fr";
import { SiteLabel } from "@/components/shared/site-label";
import { formatAgentName } from "@/lib/constants";
import type { ShiftType, PositionRole } from "@prisma/client";

type SiteWithRequirements = Site & {
  requirements: SiteRequirement[];
  agentRules: (AgentSiteRule & {
    agent: { id: string; firstName: string; lastName: string; active: boolean };
  })[];
};

type SiteDetailClientProps = {
  site: SiteWithRequirements;
};

export function SiteDetailClient({ site }: SiteDetailClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editSiteOpen, setEditSiteOpen] = useState(false);
  const [requirementDialog, setRequirementDialog] = useState<{
    open: boolean;
    requirement?: SiteRequirement;
  }>({ open: false });
  const [deleteReqId, setDeleteReqId] = useState<string | null>(null);

  function handleDeleteRequirement() {
    if (!deleteReqId) return;
    startTransition(async () => {
      const result = await deleteSiteRequirement(deleteReqId, site.id);
      if (result.success) {
        toast.success(fr.sites.requirementDeleted);
        setDeleteReqId(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/sites"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 size-4" />
            {fr.sites.backToSites}
          </Link>
          <h2 className="text-2xl font-semibold">
            <SiteLabel name={site.name} className="text-lg font-semibold" />
          </h2>
          <p className="text-sm text-muted-foreground">
            {site.client ?? fr.sites.noClient} · {site.address ?? fr.sites.noAddress}
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditSiteOpen(true)}>
          <Pencil className="mr-2 size-4" />
          {fr.sites.editSite}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{fr.common.status}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={site.active ? "default" : "secondary"}>
              {site.active ? fr.common.active : fr.common.inactive}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{fr.common.notes}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {site.notes ?? fr.sites.noNotes}
          </CardContent>
        </Card>
      </div>

      {site.agentRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{fr.sites.allowedAgents}</CardTitle>
            <CardDescription>{fr.sites.agentRulesDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(["ONLY", "PREFERRED"] as const).map((ruleType) => {
              const rules = site.agentRules.filter(
                (r) => r.ruleType === ruleType && r.agent.active
              );
              if (rules.length === 0) return null;

              return (
                <div key={ruleType} className="space-y-2">
                  <p className="text-sm font-medium">
                    {ruleType === "ONLY" ? fr.sites.allowedAgents : fr.sites.preferredAgents}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {rules.map((rule) => (
                      <Badge key={rule.id} variant="outline" className="font-normal">
                        {formatAgentName(rule.agent.firstName, rule.agent.lastName)}
                        {rule.fixedStartTime && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {rule.fixedStartTime}
                          </span>
                        )}
                        {rule.maxHours && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            max {rule.maxHours}h
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{fr.sites.shiftRequirements}</CardTitle>
            <CardDescription>{fr.sites.shiftRequirementsDesc}</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setRequirementDialog({ open: true })}
          >
            <Plus className="mr-1 size-4" />
            {fr.sites.addRequirement}
          </Button>
        </CardHeader>
        <CardContent>
          {site.requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {fr.sites.noRequirementsDefined}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{fr.sites.label}</TableHead>
                  <TableHead>{fr.sites.days}</TableHead>
                  <TableHead>{fr.sites.shift}</TableHead>
                  <TableHead>{fr.sites.hours}</TableHead>
                  <TableHead>{fr.sites.role}</TableHead>
                  <TableHead>{fr.sites.agentCount}</TableHead>
                  <TableHead>{fr.common.status}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {site.requirements.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">
                      {req.label ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDays(req.days)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{SHIFT_TYPE_LABELS[req.shiftType]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {req.startTime}–{req.endTime}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{POSITION_ROLE_LABELS[req.role]}</Badge>
                    </TableCell>
                    <TableCell>{req.agentCount}</TableCell>
                    <TableCell>
                      <Badge variant={req.active ? "default" : "secondary"}>
                        {req.active ? fr.common.active : fr.common.inactive}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            setRequirementDialog({ open: true, requirement: req })
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteReqId(req.id)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SiteFormDialog
        open={editSiteOpen}
        onOpenChange={setEditSiteOpen}
        site={site}
      />

      <RequirementFormDialog
        key={requirementDialog.requirement?.id ?? "new"}
        open={requirementDialog.open}
        onOpenChange={(open) => setRequirementDialog({ open })}
        siteId={site.id}
        requirement={requirementDialog.requirement}
        pending={pending}
        onSuccess={() => {
          setRequirementDialog({ open: false });
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteReqId)}
        onOpenChange={(open) => !open && setDeleteReqId(null)}
        title={fr.sites.deleteRequirement}
        description={fr.sites.deleteRequirementDesc}
        loading={pending}
        onConfirm={handleDeleteRequirement}
      />
    </div>
  );
}

function RequirementFormDialog({
  open,
  onOpenChange,
  siteId,
  requirement,
  pending,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  requirement?: SiteRequirement;
  pending: boolean;
  onSuccess: () => void;
}) {
  const isEdit = Boolean(requirement);
  const [days, setDays] = useState<string[]>(requirement?.days ?? ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]);
  const [shiftType, setShiftType] = useState<ShiftType>(requirement?.shiftType ?? "DAY");
  const [role, setRole] = useState<PositionRole>(requirement?.role ?? "AGENT");
  const [active, setActive] = useState(requirement?.active ?? true);
  const [, startTransition] = useTransition();

  function toggleDay(day: string) {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("siteId", siteId);
    formData.set("shiftType", shiftType);
    formData.set("role", role);
    formData.set("active", String(active));
    days.forEach((d) => formData.append("days", d));

    startTransition(async () => {
      const result =
        isEdit && requirement
          ? await updateSiteRequirement(requirement.id, formData)
          : await createSiteRequirement(formData);

      if (result.success) {
        toast.success(isEdit ? fr.sites.requirementUpdated : fr.sites.requirementCreated);
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? fr.sites.editRequirement : fr.sites.addRequirementForm}</DialogTitle>
          <DialogDescription>{fr.sites.requirementFormDesc}</DialogDescription>
        </DialogHeader>

        <form id="requirement-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="req-label">{fr.sites.label}</Label>
            <Input
              id="req-label"
              name="label"
              placeholder={fr.sites.labelPlaceholder}
              defaultValue={requirement?.label ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label>{fr.sites.days}</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ALL_DAYS.map((day) => (
                <label key={day} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={days.includes(day)}
                    onCheckedChange={() => toggleDay(day)}
                  />
                  {DAY_LABELS_FULL[day]}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{fr.sites.shiftType}</Label>
              <Select value={shiftType} onValueChange={(v) => v && setShiftType(v as ShiftType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SHIFT_TYPE_LABELS) as ShiftType[])
                    .filter((t) => t !== "OFF")
                    .map((type) => (
                      <SelectItem key={type} value={type}>
                        {SHIFT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{fr.sites.role}</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v as PositionRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(POSITION_ROLE_LABELS) as PositionRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {POSITION_ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agentCount">{fr.sites.agentCountLabel}</Label>
              <Input
                id="agentCount"
                name="agentCount"
                type="number"
                min={1}
                defaultValue={requirement?.agentCount ?? 1}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startTime">{fr.sites.startTime}</Label>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                defaultValue={requirement?.startTime ?? "08:00"}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">{fr.sites.endTime}</Label>
              <Input
                id="endTime"
                name="endTime"
                type="time"
                defaultValue={requirement?.endTime ?? "20:00"}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="priority">{fr.sites.priority}</Label>
              <Input
                id="priority"
                name="priority"
                type="number"
                defaultValue={requirement?.priority ?? 0}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{fr.common.active}</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" form="requirement-form" disabled={pending}>
            {pending ? fr.common.saving : isEdit ? fr.sites.saveChanges : fr.common.add}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
