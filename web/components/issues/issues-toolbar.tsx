"use client";

import { ArrowDown, ArrowUp, Filter, Search } from "lucide-react";
import type { Issue, IssueStatus } from "@/lib/api";
import { ISSUE_STATUSES, ISSUE_STATUS_LABELS } from "@/lib/api";
import { StatusIcon } from "@/components/status-icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  collectFilterOptions,
  type IssueFilters,
  type SortField,
  type SortState,
} from "@/lib/issue-filters";

const SORT_LABELS: Record<SortField, string> = {
  created_at: "Created",
  updated_at: "Updated",
  title: "Title",
};

const SORT_FIELDS = Object.keys(SORT_LABELS) as SortField[];

export function IssuesToolbar({
  issues,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
}: {
  issues: Issue[];
  filters: IssueFilters;
  onFiltersChange: (f: IssueFilters) => void;
  sort: SortState;
  onSortChange: (s: SortState) => void;
}) {
  const options = collectFilterOptions(issues);

  const statusCounts = new Map<IssueStatus, number>();
  for (const s of ISSUE_STATUSES) statusCounts.set(s, 0);
  const assigneeCounts = new Map<string, number>();
  const creatorCounts = new Map<string, number>();
  for (const issue of issues) {
    statusCounts.set(issue.status, (statusCounts.get(issue.status) ?? 0) + 1);
    for (const a of issue.assigned_agents) {
      assigneeCounts.set(a, (assigneeCounts.get(a) ?? 0) + 1);
    }
    if (issue.creator_name) {
      creatorCounts.set(issue.creator_name, (creatorCounts.get(issue.creator_name) ?? 0) + 1);
    }
  }

  const activeCount =
    filters.statuses.length + filters.assignees.length + filters.creators.length;

  const toggleStatus = (s: IssueStatus) => {
    const statuses = filters.statuses.includes(s)
      ? filters.statuses.filter((x) => x !== s)
      : [...filters.statuses, s];
    onFiltersChange({ ...filters, statuses });
  };
  const toggleAssignee = (a: string) => {
    const assignees = filters.assignees.includes(a)
      ? filters.assignees.filter((x) => x !== a)
      : [...filters.assignees, a];
    onFiltersChange({ ...filters, assignees });
  };
  const toggleCreator = (c: string) => {
    const creators = filters.creators.includes(c)
      ? filters.creators.filter((x) => x !== c)
      : [...filters.creators, c];
    onFiltersChange({ ...filters, creators });
  };
  const clearFilters = () =>
    onFiltersChange({ ...filters, statuses: [], assignees: [], creators: [] });

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
        <Input
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Search issues…"
          className="h-8 w-52 pl-8"
        />
      </div>

      {/* Filters */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={activeCount > 0 ? "default" : "secondary"}
            size="sm"
            className="gap-1.5"
          >
            <Filter className="size-3.5" />
            Filter
            {activeCount > 0 && (
              <span className="tabular-nums">{activeCount}</span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {ISSUE_STATUSES.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={filters.statuses.includes(s)}
                  onCheckedChange={() => toggleStatus(s)}
                >
                  <StatusIcon status={s} />
                  {ISSUE_STATUS_LABELS[s]}
                  <span className="ml-auto text-xs tabular-nums text-mute">
                    {statusCounts.get(s) ?? 0}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Assignee</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              {options.assignees.length === 0 ? (
                <DropdownMenuItem disabled>No assignees</DropdownMenuItem>
              ) : (
                options.assignees.map((a) => (
                  <DropdownMenuCheckboxItem
                    key={a}
                    checked={filters.assignees.includes(a)}
                    onCheckedChange={() => toggleAssignee(a)}
                  >
                    {a}
                    <span className="ml-auto text-xs tabular-nums text-mute">
                      {assigneeCounts.get(a) ?? 0}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Creator</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              {options.creators.length === 0 ? (
                <DropdownMenuItem disabled>No creators</DropdownMenuItem>
              ) : (
                options.creators.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c}
                    checked={filters.creators.includes(c)}
                    onCheckedChange={() => toggleCreator(c)}
                  >
                    {c}
                    <span className="ml-auto text-xs tabular-nums text-mute">
                      {creatorCounts.get(c) ?? 0}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {activeCount > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={clearFilters}>
                Clear filters
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sort */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" className="gap-1.5">
            {sort.dir === "asc" ? (
              <ArrowUp className="size-3.5" />
            ) : (
              <ArrowDown className="size-3.5" />
            )}
            {SORT_LABELS[sort.field]}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuRadioGroup
            value={sort.field}
            onValueChange={(v) =>
              onSortChange({ ...sort, field: v as SortField })
            }
          >
            {SORT_FIELDS.map((f) => (
              <DropdownMenuRadioItem key={f} value={f}>
                {SORT_LABELS[f]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              onSortChange({
                ...sort,
                dir: sort.dir === "asc" ? "desc" : "asc",
              })
            }
          >
            {sort.dir === "asc" ? "Sort descending" : "Sort ascending"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
