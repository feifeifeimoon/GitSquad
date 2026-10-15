"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

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
  /** When `data` or `error` was last written, for staleness. */
  updatedAt: number;
  /** The read in flight, so two components asking at once share one request. */
  inFlight?: Promise<unknown>;
  /**
   * The generation of the world this entry is describing. Every invalidation —
   * and every explicit `refresh` — starts a new one.
   *
   * Reads are answered *for a generation*, which is what makes the difference
   * between "this answer is current" and "this answer arrived later": a
   * response from an older generation is dropped, and a read still in flight in
   * the current one is worth joining. Timestamps alone cannot tell those apart,
   * and that is how a list kept a row it had just been told was deleted.
   */
  generation: number;
  /** The generation the in-flight read was sent in. */
  inFlightGen?: number;
  /** The generation `data`/`error` answer; `generation` means "current". */
  answeredGen: number;
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
    // `answeredGen: -1` is "nothing has been answered yet" — the first reader
    // sees an entry that is not current and reads.
    entry = { updatedAt: 0, generation: 0, answeredGen: -1 };
    cache.set(key, entry);
  }
  return entry;
}

/**
 * Read a key, joining a read that is already in flight **in the same
 * generation**.
 *
 * The same-generation condition is the whole point. A read sent before an
 * invalidation is answering a world that no longer exists, so a caller that
 * joins it gets exactly the value the invalidation exists to throw away — and
 * its response must not write either, or the entry is stamped current with
 * pre-invalidation data. Both halves are checked here rather than in the
 * callers.
 */
function read<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = entryFor(key);
  const generation = entry.generation;

  if (entry.inFlight && entry.inFlightGen === generation) {
    return entry.inFlight as Promise<T>;
  }

  const request = fetcher()
    .then((data) => {
      if (entry.generation !== generation) return data;
      entry.data = data;
      entry.error = undefined;
      entry.updatedAt = Date.now();
      entry.answeredGen = generation;
      return data;
    })
    .catch((error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (entry.generation === generation) {
        // The failure answers this generation too. Without that, a failing read
        // re-arms the entry: not current, no read in flight, read again — a
        // request loop for as long as the API is down.
        entry.error = failure;
        entry.updatedAt = Date.now();
        entry.answeredGen = generation;
      }
      throw failure;
    })
    .finally(() => {
      // A newer read owns `inFlight` if the generation moved on; leave it be.
      if (entry.inFlightGen !== generation) return;
      entry.inFlight = undefined;
      entry.inFlightGen = undefined;
      notify(key);
    });

  entry.inFlight = request;
  entry.inFlightGen = generation;
  return request;
}

/**
 * Reads derived from *every* workspace, so any workspace going stale makes them
 * stale. The All Workspaces pages read these, and they are keyed by nothing in
 * particular — `GET /api/v1/issues` is the same URL whoever is asking.
 *
 * Without this they were invisible to invalidation: creating an issue under
 * `/api/v1/workspaces/acme` left `/api/v1/issues` fresh for its 30 seconds, so
 * walking from a workspace to the aggregate board showed a board missing the
 * issue just created. Every mutation already invalidates the workspace it
 * touched, so the aggregates follow from that instead of each of the eight
 * call sites remembering two more keys.
 */
const AGGREGATE_KEYS = ["/api/v1/issues", "/api/v1/agents"];

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
    // A new generation, which is what retires any read already on the wire for
    // this key: its response belongs to the previous one and is dropped.
    entry.generation += 1;
    notify(key);
  }
  // Anything workspace-shaped, including the list at `/api/v1/workspaces`
  // itself: deleting a workspace is a workspace-shaped change that touches no
  // single workspace's keys.
  if (!prefix.startsWith("/api/v1/workspaces")) return;
  for (const key of AGGREGATE_KEYS) {
    const entry = cache.get(key);
    if (!entry) continue;
    entry.generation += 1;
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
  entry.answeredGen = entry.generation;
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

  const subscribeKey = useCallback(
    (onChange: () => void) => (key ? subscribe(key, onChange) : () => {}),
    [key],
  );
  useEffect(() => {
    if (!key) return;
    return subscribe(key, () => setVersion((n) => n + 1));
  }, [key]);

  // The value is read through useSyncExternalStore rather than mirrored into
  // state, and the reason is the subscribe/render window: a component renders
  // the cached value, a read lands before its effects have run, and `notify`
  // reaches every subscriber except the one that has not subscribed yet. The
  // entry is fresh by then, so nothing re-reads and nothing bumps `version` —
  // the render keeps a value that arrived after it. `useSyncExternalStore`
  // re-reads its snapshot after subscribing, which closes that window; it is
  // what the sidebar's width and the shell's platform check use, for the same
  // reason.
  //
  // It is not the whole story: the flake this was investigated for turned out
  // to be the in-flight join in `read` (see its comment), which no render shape
  // would have fixed. This closes the other window on the same path.
  const data = useSyncExternalStore<T | undefined>(
    subscribeKey,
    () => (key ? (cache.get(key)?.data as T | undefined) : undefined),
    () => undefined,
  );
  const error = useSyncExternalStore<Error | undefined>(
    subscribeKey,
    () => (key ? cache.get(key)?.error : undefined),
    () => undefined,
  );

  const staleTime = options.staleTime ?? 30_000;
  useEffect(() => {
    if (!key) return;
    const entry = cache.get(key);
    const current = entry !== undefined && entry.answeredGen === entry.generation;
    const hasAnswer =
      entry !== undefined &&
      (entry.data !== undefined || entry.error !== undefined);
    if (current && hasAnswer && Date.now() - entry.updatedAt < staleTime) return;

    // A read in flight in this generation answers the question being asked, so
    // join it. One sent in an earlier generation does not: `read` starts a
    // fresh one instead, and the older response is dropped when it lands.
    if (entry?.inFlight && entry.inFlightGen === entry.generation) return;

    // The failure is recorded on the entry and surfaces through `error`; this
    // catch only stops it becoming an unhandled rejection.
    read(key, () => fetcherRef.current()).catch(() => {});
  }, [key, version, staleTime]);

  const refresh = useCallback(() => {
    if (!key) return;
    entryFor(key).generation += 1;
    setVersion((n) => n + 1);
  }, [key]);

  return {
    data,
    error,
    loading: data === undefined && error === undefined,
    refresh,
  };
}
