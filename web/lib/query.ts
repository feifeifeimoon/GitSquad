"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A cache for the console's server reads, keyed by the API path that produces
// them.
//
// Nothing here was cached before, and the cost was not latency but repetition:
// nine call sites fetched `/api/v1/workspaces`, the command palette re-fetched
// both workspaces and issues every time it opened, and every WebSocket event
// made whoever was listening re-fetch a whole list.
//
// This sits underneath the page components rather than replacing them: a read
// becomes `useApi(path)` instead of a `useState` + `useEffect` pair, and the
// `api` helpers stay as they are for writes. Deliberately not React Query — the
// app has a dozen endpoints, one invalidation source, and no server rendering
// to coordinate with, so a framework would be mostly surface we never call.
//
// Invalidation is stale-while-revalidate, not eviction: the last known value
// stays on screen while it re-reads. Evicting would have shown a skeleton on
// every realtime event, which is a worse screen than a value a second out of
// date.

interface Entry {
  data?: unknown;
  error?: Error;
  /** When `data` was last written, for staleness. */
  updatedAt: number;
  /** The read in flight, so two components asking at once share one request. */
  inFlight?: Promise<unknown>;
  /** Set by invalidateApi; cleared when a read lands. */
  stale?: boolean;
}

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  const subscribers = listeners.get(key);
  if (!subscribers) return;
  for (const subscriber of subscribers) subscriber();
}

function subscribe(key: string, listener: () => void): () => void {
  let subscribers = listeners.get(key);
  if (!subscribers) {
    subscribers = new Set();
    listeners.set(key, subscribers);
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(key);
  };
}

function entryFor(key: string): Entry {
  let entry = cache.get(key);
  if (!entry) {
    entry = { updatedAt: 0, stale: true };
    cache.set(key, entry);
  }
  return entry;
}

function read<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = entryFor(key);

  // One request per key at a time: the second caller joins the first.
  if (entry.inFlight) return entry.inFlight as Promise<T>;

  const request = fetcher()
    .then((data) => {
      entry.data = data;
      entry.error = undefined;
      entry.updatedAt = Date.now();
      entry.stale = false;
      return data;
    })
    .catch((error: unknown) => {
      entry.error = error instanceof Error ? error : new Error(String(error));
      throw entry.error;
    })
    .finally(() => {
      entry.inFlight = undefined;
      notify(key);
    });

  entry.inFlight = request;
  return request;
}

/**
 * Mark everything under a path prefix stale, and let whoever is reading it
 * re-read now.
 *
 * Prefix rather than exact key because one event usually touches a family: a
 * comment on an issue changes both that issue and the board it sits on, and
 * both are keyed beneath the workspace.
 */
export function invalidateApi(prefix: string): void {
  for (const [key, entry] of cache) {
    if (!key.startsWith(prefix)) continue;
    entry.stale = true;
    notify(key);
  }
}

/**
 * Forget a path entirely — the difference from `invalidateApi` is that the data
 * stops being shown.
 *
 * For the cases where the value is not out of date but *gone*: signing out
 * evicts the identity, and a revalidation would only 401 its way to the login
 * page. Everything else wants invalidation.
 */
export function clearApi(key: string): void {
  cache.delete(key);
  notify(key);
}

/**
 * Write through the cache without a request, for an optimistic edit the
 * mutation will confirm. Subscribers see it at once, which is the point: a card
 * dragged between columns should land there now, not after a round trip. The
 * caller re-reads on failure.
 */
export function setApiData<T>(
  key: string,
  updater: (current: T | undefined) => T,
): void {
  const entry = entryFor(key);
  entry.data = updater(entry.data as T | undefined);
  entry.updatedAt = Date.now();
  entry.stale = false;
  notify(key);
}

/** Read a cached path. `refresh` re-reads now; `error` is the failure, if any. */
export function useApi<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: { staleTime?: number } = {},
): {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  refresh: () => void;
} {
  // Bumped whenever this key changes underneath us — new data, or an
  // invalidation — so the effect below re-runs and decides whether to re-read.
  const [version, setVersion] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (!key) return;
    return subscribe(key, () => setVersion((n) => n + 1));
  }, [key]);

  const staleTime = options.staleTime ?? 30_000;
  useEffect(() => {
    if (!key) return;
    const entry = cache.get(key);
    const fresh =
      entry !== undefined &&
      !entry.stale &&
      entry.data !== undefined &&
      Date.now() - entry.updatedAt < staleTime;
    if (fresh || entry?.inFlight) return;

    // The failure is recorded on the entry and surfaces through `error`; this
    // catch only stops it becoming an unhandled rejection.
    read(key, () => fetcherRef.current()).catch(() => {});
  }, [key, version, staleTime]);

  const refresh = useCallback(() => {
    if (!key) return;
    entryFor(key).stale = true;
    setVersion((n) => n + 1);
  }, [key]);

  const entry = key ? cache.get(key) : undefined;
  return {
    data: entry?.data as T | undefined,
    error: entry?.error,
    loading: entry?.data === undefined && entry?.error === undefined,
    refresh,
  };
}
