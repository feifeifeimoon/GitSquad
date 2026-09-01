import {
  Ban,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  CircleX,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { IssueStatus, ISSUE_STATUS_LABELS } from "@/lib/api";

export const STATUS_ICON: Record<
  IssueStatus,
  { icon: LucideIcon; className: string }
> = {
  backlog: { icon: CircleDashed, className: "text-mute" },
  todo: { icon: Circle, className: "text-mute" },
  in_progress: { icon: CircleDot, className: "text-warning" },
  in_review: { icon: Eye, className: "text-violet" },
  done: { icon: CheckCircle2, className: "text-cyan-deep" },
  blocked: { icon: Ban, className: "text-destructive" },
  cancelled: { icon: CircleX, className: "text-mute" },
};

export function StatusIconLabel({ status }: { status: IssueStatus }) {
  const { icon: Icon, className } = STATUS_ICON[status];
  return (
    <span className="flex items-center gap-1.5">
      <Icon className={`size-3.5 ${className}`} />
      <span>{ISSUE_STATUS_LABELS[status]}</span>
    </span>
  );
}
