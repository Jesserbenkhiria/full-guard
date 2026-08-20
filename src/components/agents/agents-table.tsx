"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import type { AgentListItem } from "@/lib/agent-operational";
import {
  agentHasRestrictions,
  agentMatchesSiteFilter,
} from "@/lib/agent-operational";
import { fr } from "@/lib/i18n/fr";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteAgent } from "@/actions/agents";
import { AgentFormDialog } from "@/components/agents/agent-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  AgentAvailabilityLabel,
  AgentContractBadge,
  AgentInitialsAvatar,
  AgentRestrictionBadge,
  AgentSiteBadges,
  AgentStatusBadge,
} from "@/components/agents/agent-visuals";
import { CONTRACT_HOURS_OPTIONS } from "@/lib/constants";
import { MoreHorizontal, Pencil, Trash2, Eye } from "lucide-react";

type SiteOption = { id: string; name: string };

type AgentsTableProps = {
  agents: AgentListItem[];
  sites: SiteOption[];
};

export function AgentsTable({ agents, sites }: AgentsTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editAgent, setEditAgent] = useState<AgentListItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [contractFilter, setContractFilter] = useState("all");
  const [restrictionsOnly, setRestrictionsOnly] = useState(false);
  const [vacationOnly, setVacationOnly] = useState(false);

  const filteredAgents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return agents.filter((agent) => {
      if (query) {
        const haystack = `${agent.firstName} ${agent.lastName}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (siteFilter !== "all" && !agentMatchesSiteFilter(agent, siteFilter)) {
        return false;
      }

      if (contractFilter !== "all" && String(agent.contractHours) !== contractFilter) {
        return false;
      }

      if (restrictionsOnly && !agentHasRestrictions(agent)) return false;
      if (vacationOnly && agent.vacations.length === 0) return false;

      return true;
    });
  }, [agents, search, siteFilter, contractFilter, restrictionsOnly, vacationOnly]);

  function handleDelete() {
    if (!deleteId) return;
    startTransition(async () => {
      const result = await deleteAgent(deleteId);
      if (result.success) {
        toast.success(fr.agents.agentDeleted);
        setDeleteId(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (agents.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{fr.agents.noAgents}</p>
    );
  }

  return (
    <>
      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={fr.agents.searchPlaceholder}
              className="pl-8"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={siteFilter} onValueChange={(v) => v && setSiteFilter(v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={fr.agents.filterAllSites} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{fr.agents.filterAllSites}</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={contractFilter} onValueChange={(v) => v && setContractFilter(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={fr.agents.filterAllContracts} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{fr.agents.filterAllContracts}</SelectItem>
                {CONTRACT_HOURS_OPTIONS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {h}h
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={restrictionsOnly ? "default" : "outline"}
            onClick={() => setRestrictionsOnly((v) => !v)}
          >
            {fr.agents.filterRestrictions}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={vacationOnly ? "default" : "outline"}
            onClick={() => setVacationOnly((v) => !v)}
          >
            {fr.agents.filterOnVacation}
          </Button>
          {(search || siteFilter !== "all" || contractFilter !== "all" || restrictionsOnly || vacationOnly) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearch("");
                setSiteFilter("all");
                setContractFilter("all");
                setRestrictionsOnly(false);
                setVacationOnly(false);
              }}
            >
              {fr.agents.clearFilters}
            </Button>
          )}
        </div>
      </div>

      {filteredAgents.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{fr.agents.noFilterResults}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{fr.agents.name}</TableHead>
              <TableHead>{fr.agents.contract}</TableHead>
              <TableHead>{fr.agents.authorizedSitesColumn}</TableHead>
              <TableHead className="hidden md:table-cell">{fr.agents.availability}</TableHead>
              <TableHead>{fr.agents.restrictions}</TableHead>
              <TableHead>{fr.common.status}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAgents.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <AgentInitialsAvatar
                      firstName={agent.firstName}
                      lastName={agent.lastName}
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/agents/${agent.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {agent.lastName}
                      </Link>
                      {agent.firstName !== agent.lastName.split(" ")[0] && (
                        <p className="truncate text-xs text-muted-foreground">{agent.firstName}</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <AgentContractBadge
                    hours={agent.contractHours}
                    overtimeAllowed={agent.overtimeAllowed}
                  />
                </TableCell>
                <TableCell className="max-w-[280px]">
                  <AgentSiteBadges agent={agent} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <AgentAvailabilityLabel agent={agent} />
                </TableCell>
                <TableCell>
                  <AgentRestrictionBadge agent={agent} />
                </TableCell>
                <TableCell>
                  <AgentStatusBadge agent={agent} />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" />}
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/agents/${agent.id}`)}>
                        <Eye className="mr-2 size-4" />
                        {fr.common.viewDetails}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditAgent(agent)}>
                        <Pencil className="mr-2 size-4" />
                        {fr.common.edit}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteId(agent.id)}
                      >
                        <Trash2 className="mr-2 size-4" />
                        {fr.common.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AgentFormDialog
        open={Boolean(editAgent)}
        onOpenChange={(open) => {
          if (!open) setEditAgent(null);
        }}
        agent={editAgent}
        sites={sites}
      />

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={fr.agents.deleteAgent}
        description={fr.agents.deleteAgentDesc}
        loading={pending}
        onConfirm={handleDelete}
      />
    </>
  );
}
