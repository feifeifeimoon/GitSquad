"use client";

import { useEffect, type ReactNode } from "react";
import { invalidateApi } from "@/lib/query";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** A workspace-scoped event pushed by the server (see pkg/types/v1/app.go). */
export interface AppEvent {
  type: string; // comment:created | issue:created | issue:updated
  workspace_id: string;
  issue_id?: string;
}

// Control frames are not application events.
const CONTROL_TYPES = new Set(["auth_ack", "error"]);

function wsURL(): string {
  return `${API_BASE.replace(/^http/, "ws")}/ws/app`;
}

// One refresh per window per workspace, not one per event.
//
// The server sends a refresh hint per change, and a workspace with agents on it
// produces a burst of them. Each one used to refetch a whole list, so a busy
// minute was a busy minute of HTTP. This is a fixed window — armed on the first
// event and deliberately not reset by later ones — so a sustained stream still
// lands one refresh per window rather than one at the end of the stream, or,
// worse, one per event.
const FLUSH_MS = 100;

let pending: Set<string> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function flush(): void {
  timer = undefined;
  const workspaces = pending;
  pending = null;
  for (const workspace of workspaces ?? []) {
    invalidateApi(`/api/v1/workspaces/${workspace}`);
  }
}

function scheduleInvalidation(workspace: string): void {
  pending ??= new Set();
  pending.add(workspace);
  if (timer === undefined) timer = setTimeout(flush, FLUSH_MS);
}

/**
 * Connect to the server's app socket for a workspace. Returns an unsubscribe.
 *
 * The token travels in the first frame, never in the URL: browsers cannot set
 * headers on a WebSocket handshake, and a query token would leak into proxy
 * logs, CDNs, and browser history.
 */
export function subscribeWorkspace(
  workspace: string,
  onEvent: (event: AppEvent) => void,
): () => void {
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    const token = localStorage.getItem("gitsquad_token");
    if (!token) return;

    socket = new WebSocket(wsURL());

    socket.onopen = () => {
      attempt = 0;
      socket?.send(
        JSON.stringify({
          type: "auth",
          payload: { token, workspace_id: workspace },
        }),
      );
    };

    socket.onmessage = (event) => {
      let parsed: AppEvent;
      try {
        parsed = JSON.parse(event.data as string) as AppEvent;
      } catch {
        return; // not our protocol
      }
      if (!parsed?.type || CONTROL_TYPES.has(parsed.type)) return;
      onEvent(parsed);
    };

    socket.onclose = () => {
      if (stopped) return;
      // Exponential backoff with jitter, capped — a flat retry would thundering
      // -herd the API after a restart.
      const base = Math.min(1000 * 2 ** attempt, 30_000);
      const jitter = base * 0.2 * (Math.random() * 2 - 1);
      attempt++;
      timer = setTimeout(connect, Math.round(base + jitter));
    };

    socket.onerror = () => {
      // onclose drives the retry.
    };
  };

  connect();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}

/**
 * The app shell's connection to the server, mounted once around the console.
 *
 * It lives here rather than in the page that happens to show the data, because
 * the page unmounts on every navigation: the socket used to be torn down and
 * rebuilt on each route change, and any event that arrived in the gap was gone
 * — leaving the next page showing stale data until something unrelated
 * happened. Events now fan out to the cache by invalidation, so a page that
 * mounts after an event reads fresh data anyway.
 */
export function RealtimeProvider({
  workspace,
  children,
}: {
  workspace?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!workspace) return;
    return subscribeWorkspace(workspace, () => scheduleInvalidation(workspace));
  }, [workspace]);

  return <>{children}</>;
}
