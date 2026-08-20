"use client";

import { Moon, Sun, Ban, Star } from "lucide-react";
import type { AgentListItem } from "@/lib/agent-operational";
import {
  getAgentAvatarHue,
  getAgentInitials,
  getAgentOperationalStatus,
  getAgentSiteBadgeItems,
} from "@/lib/agent-operational";
import {
  getContractHoursStyle,
  getSiteColorStyle,
  POLYVALENT_BADGE_CLASS,
} from "@/lib/site-colors";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fr } from "@/lib/i18n/fr";

export function AgentInitialsAvatar({
  firstName,
  lastName,
  size = "sm",
}: {
  firstName: string;
  lastName: string;
  size?: "sm" | "default";
}) {
  const initials = getAgentInitials(firstName, lastName);
  const hue = getAgentAvatarHue(firstName, lastName);

  return (
    <Avatar size={size} className="shrink-0">
      <AvatarFallback
        className="text-[10px] font-semibold text-white"
        style={{ backgroundColor: `hsl(${hue} 45% 42%)` }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export function AgentSiteBadges({ agent }: { agent: AgentListItem }) {
  const items = getAgentSiteBadgeItems(agent);

  if (items === "polyvalent") {
    return (
      <Badge variant="outline" className={cn("gap-1 font-normal", POLYVALENT_BADGE_CLASS)}>
        <Star className="size-3 fill-current" />
        {fr.agents.polyvalent}
      </Badge>
    );
  }

  if (items.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => {
        const style = getSiteColorStyle(item.siteName);
        return (
          <Badge
            key={`${item.siteName}-${item.ruleType}`}
            variant="outline"
            className={cn("gap-1 font-normal", style.badgeClass)}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", style.dotClass)} />
            {style.shortLabel}
            {item.ruleType === "PREFERRED" && (
              <span className="text-[10px] opacity-70">pref.</span>
            )}
          </Badge>
        );
      })}
    </div>
  );
}

export function AgentContractBadge({
  hours,
  overtimeAllowed,
}: {
  hours: number | null;
  overtimeAllowed: boolean;
}) {
  const style = getContractHoursStyle(hours);

  return (
    <div className="flex flex-col gap-1">
      <Badge variant="outline" className={cn("w-fit gap-1.5 font-normal tabular-nums", style.badgeClass)}>
        <span className={cn("size-1.5 shrink-0 rounded-full", style.dotClass)} />
        {hours ?? "—"}h
      </Badge>
      {overtimeAllowed && (
        <Badge variant="outline" className="w-fit text-[10px] font-normal">
          {fr.agents.ot}
        </Badge>
      )}
    </div>
  );
}

export function AgentRestrictionBadge({ agent }: { agent: AgentListItem }) {
  if (agent.nightForbidden) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-red-200 bg-red-50 font-normal text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      >
        <Ban className="size-3" />
        {fr.agents.noNights}
      </Badge>
    );
  }

  if (agent.dayOnly) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-200 bg-amber-50 font-normal text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        <Sun className="size-3" />
        {fr.agents.dayOnly}
      </Badge>
    );
  }

  if (agent.canWorkNight) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-slate-200 bg-slate-50 font-normal text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        <Moon className="size-3" />
        {fr.agents.dayNight}
      </Badge>
    );
  }

  return null;
}

const STATUS_STYLES: Record<
  ReturnType<typeof getAgentOperationalStatus>,
  { className: string; dotClass: string }
> = {
  active: {
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    dotClass: "bg-emerald-500",
  },
  inactive: {
    className:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    dotClass: "bg-red-500",
  },
  vacation: {
    className:
      "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200",
    dotClass: "bg-orange-500",
  },
  medical: {
    className:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
    dotClass: "bg-blue-500",
  },
  unavailable: {
    className:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
    dotClass: "bg-amber-500",
  },
};

const STATUS_LABELS: Record<ReturnType<typeof getAgentOperationalStatus>, string> = {
  active: fr.agents.statusActive,
  inactive: fr.common.inactive,
  vacation: fr.agents.statusVacation,
  medical: fr.agents.statusMedical,
  unavailable: fr.agents.statusUnavailable,
};

export function AgentStatusBadge({ agent }: { agent: AgentListItem }) {
  const status = getAgentOperationalStatus(agent);
  const style = STATUS_STYLES[status];

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", style.className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", style.dotClass)} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function AgentAvailabilityLabel({ agent }: { agent: AgentListItem }) {
  const status = getAgentOperationalStatus(agent);

  const labels: Record<typeof status, string> = {
    active: fr.agents.availabilityReady,
    inactive: fr.agents.availabilityInactive,
    vacation: fr.agents.availabilityVacation,
    medical: fr.agents.availabilityMedical,
    unavailable: fr.agents.availabilityBlocked,
  };

  return (
    <span
      className={cn(
        "text-sm",
        status === "active" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
      )}
    >
      {labels[status]}
    </span>
  );
}
