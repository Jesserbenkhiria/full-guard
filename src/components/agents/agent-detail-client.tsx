"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr as dateFnsFr } from "date-fns/locale";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type {
  Absence,
  Agent,
  MedicalVisit,
  UnavailableDate,
  Vacation,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AgentFormDialog } from "@/components/agents/agent-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  createAbsence,
  createMedicalVisit,
  createUnavailableDate,
  createVacation,
  deleteAbsence,
  deleteMedicalVisit,
  deleteUnavailableDate,
  deleteVacation,
} from "@/actions/agents";
import { ABSENCE_REASON_LABELS, AGENT_SITE_RULE_LABELS, DAY_LABELS, DAY_LABELS_FULL, SITE_RESTRICTION_LABELS } from "@/lib/constants";
import { fr } from "@/lib/i18n/fr";

type SiteOption = { id: string; name: string };

type AgentWithRelations = Agent & {
  siteRules: {
    id: string;
    ruleType: import("@prisma/client").AgentSiteRuleType;
    allowedDays: import("@prisma/client").DayOfWeek[];
    fixedStartTime: string | null;
    fixedEndTime: string | null;
    maxHours: number | null;
    notes: string | null;
    site: { id: string; name: string };
  }[];
  vacations: Vacation[];
  absences: Absence[];
  medicalVisits: MedicalVisit[];
  unavailableDates: UnavailableDate[];
};

type AgentDetailClientProps = {
  agent: AgentWithRelations;
  sites: SiteOption[];
};

type DeleteTarget =
  | { type: "vacation"; id: string }
  | { type: "absence"; id: string }
  | { type: "medical"; id: string }
  | { type: "unavailable"; id: string };

export function AgentDetailClient({ agent, sites }: AgentDetailClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const [vacationOpen, setVacationOpen] = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [absenceReason, setAbsenceReason] = useState("OTHER");
  const [medicalOpen, setMedicalOpen] = useState(false);
  const [unavailableOpen, setUnavailableOpen] = useState(false);

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      let result;
      switch (deleteTarget.type) {
        case "vacation":
          result = await deleteVacation(deleteTarget.id, agent.id);
          break;
        case "absence":
          result = await deleteAbsence(deleteTarget.id, agent.id);
          break;
        case "medical":
          result = await deleteMedicalVisit(deleteTarget.id, agent.id);
          break;
        case "unavailable":
          result = await deleteUnavailableDate(deleteTarget.id, agent.id);
          break;
      }
      if (result.success) {
        toast.success(fr.agents.deleted);
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  async function submitForm(
    action: (fd: FormData) => Promise<{ success: boolean; error?: string }>,
    formData: FormData,
    onSuccess: () => void
  ) {
    formData.set("agentId", agent.id);
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        toast.success(fr.agents.saved);
        onSuccess();
        router.refresh();
      } else {
        toast.error(result.error ?? "Échec");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/agents"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 size-4" />
            {fr.agents.backToAgents}
          </Link>
          <h2 className="text-2xl font-semibold">{agent.lastName}</h2>
          <p className="text-sm text-muted-foreground">
            {agent.contractHours}{fr.agents.perMonth} ·{" "}
            {agent.overtimeAllowed ? fr.agents.otAllowed : fr.agents.noOt} ·{" "}
            {agent.maxVacationsPerMonth} {fr.agents.maxVacationsShort}
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 size-4" />
          {fr.agents.editProfile}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{fr.agents.contactCard}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{agent.phone ?? fr.agents.noPhone}</p>
            <p className="text-muted-foreground">{agent.email ?? fr.agents.noEmail}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{fr.agents.restrictionsCard}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {agent.dayOnly && <Badge variant="outline">{fr.agents.dayOnly}</Badge>}
            {agent.nightForbidden && <Badge variant="outline">{fr.agents.noNights}</Badge>}
            {!agent.dayOnly && agent.canWorkNight && (
              <Badge variant="outline">{fr.agents.nightOk}</Badge>
            )}
            <Badge variant={agent.active ? "default" : "secondary"}>
              {agent.active ? fr.common.active : fr.common.inactive}
            </Badge>
          </CardContent>
        </Card>
        <Card className="md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{fr.agents.siteRulesCard}</CardTitle>
          </CardHeader>
          <CardContent>
            {agent.siteRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {SITE_RESTRICTION_LABELS[agent.siteRestrictionType]} — {fr.agents.siteRulesEmpty}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{fr.planning.site}</TableHead>
                    <TableHead>{fr.agents.siteRestrictionType}</TableHead>
                    <TableHead>{fr.agents.allowedDays}</TableHead>
                    <TableHead>{fr.common.details}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agent.siteRules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.site.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{AGENT_SITE_RULE_LABELS[rule.ruleType]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {rule.allowedDays.length > 0
                          ? rule.allowedDays.map((d) => DAY_LABELS[d]).join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[
                          rule.fixedStartTime && `${fr.agents.fixedStart} ${rule.fixedStartTime}`,
                          rule.fixedEndTime && `${fr.agents.fixedEnd} ${rule.fixedEndTime}`,
                          rule.maxHours && `${fr.agents.maxHoursSite} ${rule.maxHours}h`,
                          rule.notes,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {agent.preferredDays.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{fr.agents.preferredDaysCard}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {agent.preferredDays.map((day) => (
              <Badge key={day} variant="secondary">
                {DAY_LABELS_FULL[day]}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="vacations">
        <TabsList>
          <TabsTrigger value="vacations">{fr.agents.vacations} ({agent.vacations.length})</TabsTrigger>
          <TabsTrigger value="absences">{fr.agents.absences} ({agent.absences.length})</TabsTrigger>
          <TabsTrigger value="medical">{fr.agents.medical} ({agent.medicalVisits.length})</TabsTrigger>
          <TabsTrigger value="unavailable">
            {fr.agents.unavailable} ({agent.unavailableDates.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vacations" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{fr.agents.vacationsTitle}</CardTitle>
                <CardDescription>{fr.agents.vacationsDesc}</CardDescription>
              </div>
              <Button size="sm" onClick={() => setVacationOpen(true)}>
                <Plus className="mr-1 size-4" />
                {fr.common.add}
              </Button>
            </CardHeader>
            <CardContent>
              <AvailabilityTable
                emptyMessage={fr.agents.noVacations}
                rows={agent.vacations.map((v) => ({
                  id: v.id,
                  primary: `${format(v.startDate, "dd MMM yyyy", { locale: dateFnsFr })} → ${format(v.endDate, "dd MMM yyyy", { locale: dateFnsFr })}`,
                  secondary: v.reason ?? undefined,
                }))}
                onDelete={(id) => setDeleteTarget({ type: "vacation", id })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="absences" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{fr.agents.absencesTitle}</CardTitle>
                <CardDescription>{fr.agents.absencesDesc}</CardDescription>
              </div>
              <Button size="sm" onClick={() => setAbsenceOpen(true)}>
                <Plus className="mr-1 size-4" />
                {fr.common.add}
              </Button>
            </CardHeader>
            <CardContent>
              <AvailabilityTable
                emptyMessage={fr.agents.noAbsences}
                rows={agent.absences.map((a) => ({
                  id: a.id,
                  primary: `${format(a.startDate, "dd MMM yyyy", { locale: dateFnsFr })} → ${format(a.endDate, "dd MMM yyyy", { locale: dateFnsFr })}`,
                  secondary: `${ABSENCE_REASON_LABELS[a.reason]}${a.notes ? ` · ${a.notes}` : ""}`,
                }))}
                onDelete={(id) => setDeleteTarget({ type: "absence", id })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medical" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{fr.agents.medicalTitle}</CardTitle>
                <CardDescription>{fr.agents.medicalDesc}</CardDescription>
              </div>
              <Button size="sm" onClick={() => setMedicalOpen(true)}>
                <Plus className="mr-1 size-4" />
                {fr.common.add}
              </Button>
            </CardHeader>
            <CardContent>
              <AvailabilityTable
                emptyMessage={fr.agents.noMedical}
                rows={agent.medicalVisits.map((m) => ({
                  id: m.id,
                  primary: `${format(m.date, "dd MMM yyyy", { locale: dateFnsFr })} at ${m.time}`,
                  secondary: m.notes ?? undefined,
                }))}
                onDelete={(id) => setDeleteTarget({ type: "medical", id })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unavailable" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{fr.agents.unavailableTitle}</CardTitle>
                <CardDescription>{fr.agents.unavailableDesc}</CardDescription>
              </div>
              <Button size="sm" onClick={() => setUnavailableOpen(true)}>
                <Plus className="mr-1 size-4" />
                {fr.common.add}
              </Button>
            </CardHeader>
            <CardContent>
              <AvailabilityTable
                emptyMessage={fr.agents.noUnavailable}
                rows={agent.unavailableDates.map((u) => ({
                  id: u.id,
                  primary: format(u.date, "dd MMM yyyy", { locale: dateFnsFr }),
                  secondary: u.reason ?? undefined,
                }))}
                onDelete={(id) => setDeleteTarget({ type: "unavailable", id })}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AgentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        agent={agent}
        sites={sites}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={fr.agents.deleteRecord}
        description={fr.common.confirmDelete}
        loading={pending}
        onConfirm={handleDelete}
      />

      <SimpleFormDialog
        open={vacationOpen}
        onOpenChange={setVacationOpen}
        title={fr.agents.addVacation}
        pending={pending}
        onSubmit={(fd) => submitForm(createVacation, fd, () => setVacationOpen(false))}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="startDate">{fr.agents.startDate}</Label>
            <Input id="startDate" name="startDate" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">{fr.agents.endDate}</Label>
            <Input id="endDate" name="endDate" type="date" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reason">{fr.agents.reason}</Label>
          <Input id="reason" name="reason" placeholder={fr.common.optional} />
        </div>
      </SimpleFormDialog>

      <SimpleFormDialog
        open={absenceOpen}
        onOpenChange={setAbsenceOpen}
        title={fr.agents.addAbsence}
        pending={pending}
        onSubmit={(fd) => {
          fd.set("reason", absenceReason);
          submitForm(createAbsence, fd, () => setAbsenceOpen(false));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="abs-start">{fr.agents.startDate}</Label>
            <Input id="abs-start" name="startDate" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="abs-end">{fr.agents.endDate}</Label>
            <Input id="abs-end" name="endDate" type="date" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{fr.agents.reason}</Label>
          <Select value={absenceReason} onValueChange={(v) => v && setAbsenceReason(v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ABSENCE_REASON_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="abs-notes">{fr.common.notes}</Label>
          <Textarea id="abs-notes" name="notes" rows={2} />
        </div>
      </SimpleFormDialog>

      <SimpleFormDialog
        open={medicalOpen}
        onOpenChange={setMedicalOpen}
        title={fr.agents.addMedical}
        pending={pending}
        onSubmit={(fd) => submitForm(createMedicalVisit, fd, () => setMedicalOpen(false))}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="med-date">{fr.agents.date}</Label>
            <Input id="med-date" name="date" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="med-time">{fr.agents.time}</Label>
            <Input id="med-time" name="time" type="time" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="med-notes">{fr.common.notes}</Label>
          <Textarea id="med-notes" name="notes" rows={2} />
        </div>
      </SimpleFormDialog>

      <SimpleFormDialog
        open={unavailableOpen}
        onOpenChange={setUnavailableOpen}
        title={fr.agents.addUnavailable}
        pending={pending}
        onSubmit={(fd) =>
          submitForm(createUnavailableDate, fd, () => setUnavailableOpen(false))
        }
      >
        <div className="space-y-2">
          <Label htmlFor="unavail-date">{fr.agents.date}</Label>
          <Input id="unavail-date" name="date" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unavail-reason">{fr.agents.reason}</Label>
          <Input id="unavail-reason" name="reason" placeholder={fr.common.optional} />
        </div>
      </SimpleFormDialog>
    </div>
  );
}

function AvailabilityTable({
  rows,
  emptyMessage,
  onDelete,
}: {
  rows: { id: string; primary: string; secondary?: string }[];
  emptyMessage: string;
  onDelete: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{fr.common.details}</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <p className="text-sm">{row.primary}</p>
              {row.secondary && (
                <p className="text-xs text-muted-foreground">{row.secondary}</p>
              )}
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="icon-sm" onClick={() => onDelete(row.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SimpleFormDialog({
  open,
  onOpenChange,
  title,
  pending,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{fr.agents.addEntryDesc}</DialogDescription>
        </DialogHeader>
        <form
          id={`form-${title}`}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(new FormData(e.currentTarget));
          }}
          className="space-y-4"
        >
          {children}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" form={`form-${title}`} disabled={pending}>
            {pending ? fr.common.saving : fr.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
