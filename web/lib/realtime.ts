"use client";

import { useEffect, useRef } from "react";

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

/**
 * Subscribe to realtime events for a workspace. Returns an unsubscribe function.
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
 * Subscribe to a workspace's events for the lifetime of the component,
 * reconnecting on workspace changes. The handler is held in a ref so callers can
 * pass an inline closure without tearing the connection down every render.
 */
export function useWorkspaceEvents(
  workspace: string | undefined,
  onEvent: (event: AppEvent) => void,
): void {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!workspace) return;
    return subscribeWorkspace(workspace, (event) => handler.current(event));
  }, [workspace]);
}
