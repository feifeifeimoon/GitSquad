"use client";

import type { ComponentProps } from "react";

import { RobotHead } from "@/vendor/robot-heads/RobotHead";

// The client boundary for the vendored head, shared by the hero and the console
// (an agent's face — see components/agents/agent-head.tsx). Upstream ships it for
// a Vite site, where every module is client-side already, so the file carries no
// `"use client"` of its own — and Next refuses a hook-using module in the server
// graph. Marking the parent instead keeps the vendored tree byte-for-byte
// upstream's.
export function TvHead(props: ComponentProps<typeof RobotHead>) {
  return <RobotHead {...props} />;
}
