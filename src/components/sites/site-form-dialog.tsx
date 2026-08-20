"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Site } from "@prisma/client";
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
import { createSite, updateSite } from "@/actions/sites";
import { fr } from "@/lib/i18n/fr";

type SiteFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site?: Site | null;
};

export function SiteFormDialog({ open, onOpenChange, site }: SiteFormDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(site);
  const [active, setActive] = useState(site?.active ?? true);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("active", String(active));

    startTransition(async () => {
      const result =
        isEdit && site ? await updateSite(site.id, formData) : await createSite(formData);

      if (result.success) {
        toast.success(isEdit ? fr.sites.siteUpdated : fr.sites.siteCreated);
        onOpenChange(false);
        router.refresh();
        if (!isEdit && result.data?.id) {
          router.push(`/sites/${result.data.id}`);
        }
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? fr.sites.editSite : fr.sites.addSiteForm}</DialogTitle>
          <DialogDescription>{fr.sites.formDesc}</DialogDescription>
        </DialogHeader>

        <form id="site-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{fr.sites.siteName}</Label>
            <Input id="name" name="name" defaultValue={site?.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client">{fr.sites.client}</Label>
            <Input id="client" name="client" defaultValue={site?.client ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">{fr.sites.address}</Label>
            <Input id="address" name="address" defaultValue={site?.address ?? ""} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="site-active">{fr.common.active}</Label>
            <Switch id="site-active" checked={active} onCheckedChange={setActive} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-notes">{fr.common.notes}</Label>
            <Textarea id="site-notes" name="notes" defaultValue={site?.notes ?? ""} rows={2} />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {fr.common.cancel}
          </Button>
          <Button type="submit" form="site-form" disabled={pending}>
            {pending ? fr.common.saving : isEdit ? fr.sites.saveChanges : fr.sites.createSite}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
