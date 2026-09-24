"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { IssueAssignee } from "@/lib/api";

// The one accountable person on an issue. Drawn with the shadcn avatar rather
// than WorkspaceAvatar so a person and an agent are told apart at a glance: a
// person is a photo (or initials on a neutral circle), an agent is the tinted
// monogram the rest of the console uses. Nothing else on the chip distinguishes
// them, which is why the tooltip names the kind.
export function AssigneeAvatar({
  assignee,
  className = "size-4",
}: {
  assignee: IssueAssignee;
  className?: string;
}) {
  return (
    <Avatar className={cn("shrink-0", className)}>
      {assignee.avatar_url ? <AvatarImage src={assignee.avatar_url} alt="" /> : null}
      <AvatarFallback className="text-[9px]">
        {assignee.login.trim().slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export function AssigneeChip({ assignee }: { assignee: IssueAssignee }) {
  return (
    <span
      className="flex min-w-0 items-center gap-1.5"
      title={`${assignee.login} (person)`}
    >
      <AssigneeAvatar assignee={assignee} />
      <span className="truncate">{assignee.login}</span>
    </span>
  );
}
