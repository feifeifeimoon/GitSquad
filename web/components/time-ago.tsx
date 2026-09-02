"use client";

import { timeAgo } from "@/lib/time";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

// Relative time label with a hover tooltip showing the full timestamp.
export function TimeAgo({
  iso,
  className,
}: {
  iso: string | null;
  className?: string;
}) {
  if (!iso) {
    return <span className={className}>{timeAgo(iso)}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{timeAgo(iso)}</span>
      </TooltipTrigger>
      <TooltipContent>{new Date(iso).toLocaleString()}</TooltipContent>
    </Tooltip>
  );
}
