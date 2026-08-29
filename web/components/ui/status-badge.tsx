import { cn } from "@/lib/utils";

const STATUS: Record<string, { dot: string; label: string; className: string }> = {
  active: { dot: "bg-mute", label: "Active", className: "text-body" },
  degraded: { dot: "bg-warning", label: "Degraded", className: "text-warning-deep" },
  archived: { dot: "bg-mute", label: "Archived", className: "text-mute" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const s = STATUS[status] ?? STATUS.active;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        s.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
