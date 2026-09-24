"use client";

import { useState } from "react";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { issueApi, memberApi, type IssueAssignee, type Member } from "@/lib/api";
import { useApi } from "@/lib/query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssigneeAvatar, AssigneeChip } from "./assignee-chip";
import { EmptySlot, ROW_TRIGGER } from "./property-row";

// The one person accountable for this issue — single by design, because two
// owners is no owner, and because a set has no first member to ask when
// something is stuck.
//
// The roster comes from the server (GET /workspaces/:id/members) rather than
// from "the current user": a workspace has exactly one member today, so the
// menu holds Unassigned and you. When workspaces get collaborators, the list
// grows here and nothing else changes.
export function AssigneePicker({
  slug,
  issueKey,
  assignee,
  onSaved,
}: {
  slug: string;
  issueKey: string;
  assignee?: IssueAssignee | null;
  onSaved: () => void;
}) {
  const { data: members } = useApi<Member[]>(
    `/api/v1/workspaces/${slug}/members`,
    () => memberApi.list(slug),
  );
  const [open, setOpen] = useState(false);

  // Single-select commits on choose and the menu closes itself: there is no set
  // to assemble, so a draft would only add a step.
  const choose = (userId: string) => {
    issueApi
      .update(slug, issueKey, { assignee_id: userId })
      .then(onSaved)
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Failed to update assignee");
        onSaved();
      });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={ROW_TRIGGER}
          aria-label={assignee ? `Assignee: ${assignee.login}` : "Assignee: unassigned"}
        >
          {assignee ? (
            <AssigneeChip assignee={assignee} />
          ) : (
            <EmptySlot label="Unassigned" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuRadioGroup
          value={assignee?.id ?? ""}
          onValueChange={(value) => choose(value)}
        >
          <DropdownMenuRadioItem className="pl-8" value="">
            <UserMinus className="size-3.5 text-mute" />
            <span className="text-mute">Unassigned</span>
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-caption tracking-wider text-mute uppercase">
            People
          </DropdownMenuLabel>
          {(members ?? []).map((member) => (
            <DropdownMenuRadioItem key={member.id} value={member.id}>
              <AssigneeAvatar assignee={member} />
              <span className="truncate">{member.login}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
