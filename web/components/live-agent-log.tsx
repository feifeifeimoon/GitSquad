"use client";

import { useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCursor((current) => (current + 1) % stream.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, []);

  const visibleLines = useMemo(
    () => Array.from({ length: 4 }, (_, index) => stream[(cursor + index) % stream.length]),
    [cursor],
  );

  return (
    <div className="h-[132px] overflow-hidden bg-black px-6 py-5 font-mono text-[12px] leading-6 sm:px-8">
      <div className="transition-transform duration-500 ease-out">
        {visibleLines.map(([time, agent, message]) => (
          <p key={time + agent + message} className="grid grid-cols-[78px_82px_1fr] gap-2 text-slate-500 max-sm:grid-cols-1 max-sm:gap-0 max-sm:py-1">
            <span>[{time}]</span>
            <span className="text-orange-400">{agent}</span>
            <span className="truncate text-slate-100">{message}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
