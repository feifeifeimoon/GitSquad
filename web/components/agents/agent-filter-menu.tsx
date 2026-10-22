"use client";

import { Filter } from "lucide-react";
import {
  activeAgentFilters,
  type AgentFilterCounts,
  type AgentFilters,
} from "@/lib/agent-filters";
import type { AgentAvailability, AgentWorkload } from "@/lib/agent-presence";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// One Filter entry with both facets inside — the same shape as the issue
// board's toolbar (`components/issues/issues-toolbar.tsx`). Two chip rows side
// by side read as the same control drawn twice; one menu with two labelled
// groups says what each facet is, and leaves the toolbar to the search box.
//
// Counts are always over the unfiltered roster, so choosing `Offline` does not
// zero the `Working` count somebody was about to compare against.

const AVAILABILITY: Array<{ value: "all" | AgentAvailability; label: string }> = [
  { value: "all", label: "All" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
];

const WORKLOAD: Array<{ value: "all" | AgentWorkload; label: string }> = [
  { value: "all", label: "All" },
  { value: "working", label: "Working" },
  { value: "queued", label: "Queued" },
  { value: "idle", label: "Idle" },
];

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto text-caption tabular-nums text-mute">{children}</span>
  );
}

export function AgentFilterMenu({
  filters,
  onChange,
  counts,
}: {
  filters: AgentFilters;
  onChange: (filters: AgentFilters) => void;
  counts: AgentFilterCounts;
}) {
  const active = activeAgentFilters(filters);
  const total = counts.availability.online + counts.availability.offline;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={active > 0 ? "default" : "secondary"}
          size="sm"
          className="gap-1.5"
        >
          <Filter className="size-3.5" />
          Filter
          {active > 0 && <span className="tabular-nums">{active}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Availability</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuRadioGroup
              value={filters.availability}
              onValueChange={(value) =>
                onChange({
                  ...filters,
                  availability: value as AgentFilters["availability"],
                })
              }
            >
              {AVAILABILITY.map((item) => (
                <DropdownMenuRadioItem key={item.value} value={item.value}>
                  {item.label}
                  <Count>
                    {item.value === "all"
                      ? total
                      : counts.availability[item.value]}
                  </Count>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Workload</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuRadioGroup
              value={filters.workload}
              onValueChange={(value) =>
                onChange({
                  ...filters,
                  workload: value as AgentFilters["workload"],
                })
              }
            >
              {WORKLOAD.map((item) => (
                <DropdownMenuRadioItem key={item.value} value={item.value}>
                  {item.label}
                  <Count>
                    {item.value === "all" ? total : counts.workload[item.value]}
                  </Count>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {active > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                onChange({
                  ...filters,
                  availability: "all",
                  workload: "all",
                })
              }
            >
              Clear filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
