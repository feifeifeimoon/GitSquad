"use client";

import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/status-dot";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import type { IssueAgent } from "@/lib/api";

// An agent, drawn the way the rest of the console draws one: the tinted monogram
// (or uploaded picture) from WorkspaceAvatar, never a raw `@name` string. The
// issue page was the last place that spelled agents as text.
//
// The state dot is what the old comma-joined list could never say: whether the
// agent is working on *this* issue right now, or queued for it. The server
// derives it per (issue, agent) from the task queue, so an agent busy elsewhere
// is idle here — which is the question the row is actually asking.

/** How a state reads to a person, or null when there is nothing to say. */
const STATE_LABEL: Record<IssueAgent["state"], string | null> = {
  running: "working on this issue",
  queued: "queued for this issue",
  idle: null,
};

/** The surface the dot has to cut out of, so the ring can match it. */
type Surface = "page" | "canvas";

export function AgentAvatar({
  agent,
  className = "size-4",
  surface = "page",
  showState = true,
}: {
  agent: IssueAgent;
  className?: string;
  surface?: Surface;
  /** Off inside a stack, which draws one dot for the whole group instead. */
  showState?: boolean;
}) {
  const state = showState ? STATE_LABEL[agent.state] : null;
  return (
    <span
      className={cn("relative flex shrink-0", className)}
      // The dot is colour alone, so the words travel with the avatar: a title
      // for a pointer, and the same sentence for a screen reader.
      title={state ?? undefined}
    >
      <WorkspaceAvatar
        name={agent.name}
        avatarUrl={agent.avatar_url}
        className="size-full"
      />
      {state && (
        <>
          <StatusDot
            tone={agent.state}
            className={cn(
              // 6px on a 16px avatar: big enough to read, small enough that the
              // monogram behind it stays legible. The ring is the plane's own
              // colour, so the dot reads as cut out of the avatar rather than
              // stuck onto its corner.
              "absolute -right-0.5 -bottom-0.5 ring-2",
              surface === "canvas" ? "ring-canvas" : "ring-page",
            )}
          />
          <span className="sr-only">{state}</span>
        </>
      )}
    </span>
  );
}

/** One agent as a chip: avatar plus name. The name carries no `@` — that is the
 * mention syntax, and it belongs where somebody is speaking (the feed, the
 * composer), not in a property row. The tooltip says which kind of actor it is. */
export function AgentChip({ agent }: { agent: IssueAgent }) {
  const state = STATE_LABEL[agent.state];
  return (
    <span
      className="flex min-w-0 items-center gap-1.5"
      title={state ? `@${agent.name} (agent), ${state}` : `@${agent.name} (agent)`}
    >
      <AgentAvatar agent={agent} />
      <span className="truncate">{agent.name}</span>
    </span>
  );
}

/** The agents on a board card: avatars only, overlapping, capped so a card's
 * width never depends on how many agents an issue has.
 *
 * One status dot for the whole stack, not one per avatar. At 16px the avatars
 * overlap, so an earlier avatar's dot is covered by the next one — the running
 * agent's dot disappeared behind the queued agent's picture. What the card is
 * asked is "is anything happening on this issue", and which agent it is gets
 * answered on the issue itself, where the names are. */
export function AgentStack({
  agents,
  max = 3,
}: {
  agents: IssueAgent[];
  max?: number;
}) {
  if (agents.length === 0) return null;
  const shown = agents.slice(0, max);
  const rest = agents.length - shown.length;
  const tone =
    shown.find((a) => a.state === "running")?.state ??
    shown.find((a) => a.state === "queued")?.state ??
    null;
  return (
    <span className="flex shrink-0 items-center">
      <span className="relative flex items-center">
        {shown.map((agent, i) => (
          <AgentAvatar
            key={agent.id}
            agent={agent}
            showState={false}
            surface="canvas"
            className={cn("size-4 rounded-sm", i > 0 && "-ml-1")}
          />
        ))}
        {tone && (
          <StatusDot
            tone={tone}
            label={tone === "running" ? "working on this issue" : "queued for this issue"}
            className="absolute -right-0.5 -bottom-0.5 ring-2 ring-canvas"
          />
        )}
      </span>
      {rest > 0 && (
        <span className="ml-1 text-micro tabular-nums text-mute">+{rest}</span>
      )}
    </span>
  );
}
