"use client";

import { useSyncExternalStore } from "react";
import { timeAgo } from "@/lib/time";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

// A relative label is only as fresh as the render that produced it, and nothing
// on a board or an activity feed re-renders on its own — so "just now" used to
// sit there until some unrelated update happened to repaint the row.
//
// One interval serves every label on screen rather than one each: N rows with N
// staggered timers would turn one logical tick into N independent commits. The
// clock stops while the tab is hidden, since a backgrounded board has nobody
// reading its timestamps.
const TICK_MS = 30_000;

// Module state rather than React state — the whole point is that all
// subscribers share one reading. Seeded at load so getServerSnapshot returns a
// stable value during SSR.
let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function publish(): void {
  current = Date.now();
  for (const listener of listeners) listener();
}

/**
 * Run the shared interval exactly when there is a subscriber and the tab is
 * visible. Called on subscribe, on the last unsubscribe, and on every
 * visibility change.
 */
function sync(): void {
  const shouldRun = listeners.size > 0 && !document.hidden;
  if (!shouldRun) {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
    return;
  }
  if (timer === undefined) {
    timer = setInterval(publish, TICK_MS);
    // Catch up at once: after a hidden stretch or a cold mount the stored
    // reading can be arbitrarily old, and the labels should not wait a tick.
    publish();
  }
}

function subscribe(listener: () => void): () => void {
  const wasIdle = listeners.size === 0;
  listeners.add(listener);
  if (wasIdle) document.addEventListener("visibilitychange", sync);
  sync();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", sync);
      sync();
    }
  };
}

const getSnapshot = (): number => current;

/** Relative time label with a hover tooltip showing the full timestamp. */
export function TimeAgo({
  iso,
  className,
}: {
  iso: string | null;
  className?: string;
}) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const label = timeAgo(iso, now);

  if (!iso) {
    return <span className={className}>{label}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{label}</span>
      </TooltipTrigger>
      <TooltipContent>{new Date(iso).toLocaleString()}</TooltipContent>
    </Tooltip>
  );
}
