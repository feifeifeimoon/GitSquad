"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";

const stream = [
  ["16:27:00", "@janitor", "Identified pattern for code duplication in /ui"],
  ["16:27:04", "@janitor", "Updating documentation for internal API v2"],
  ["16:27:08", "@reviewer", "Updating documentation for internal API v2"],
  ["16:27:12", "@deployer", "Cleaning up stale branches older than 30 days"],
  ["16:27:16", "@architect", "Drafting workspace boundary map for runtime adapters"],
  ["16:27:20", "@reviewer", "Scanning PR #482 for security vulnerabilities"],
];

export function LiveAgentLog() {
  const [cursor, setCursor] = useState(3);
  const reducedMotion = usePrefersReducedMotion();

  // A line arriving every three seconds is motion, and the stylesheet cannot
  // reach it — this is a timer, not a transition. Readers who asked for less
  // motion get the four lines held still.
  useEffect(() => {
    if (reducedMotion) return;
    const interval = window.setInterval(() => {
      setCursor((current) => (current + 1) % stream.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  const visibleLines = useMemo(
    () => Array.from({ length: 4 }, (_, index) => stream[(cursor + index) % stream.length]),
    [cursor],
  );

  return (
    <div className="h-[132px] overflow-hidden bg-black px-6 py-5 font-mono text-caption leading-6 sm:px-8">
      <div>
        {visibleLines.map(([time, agent, message]) => (
          <p key={time + agent + message} className="grid grid-cols-[78px_82px_1fr] gap-2 text-white/40 max-sm:grid-cols-1 max-sm:gap-0 max-sm:py-1">
            <span>[{time}]</span>
            <span className="text-[#50e3c2]">{agent}</span>
            <span className="truncate text-white/80">{message}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
