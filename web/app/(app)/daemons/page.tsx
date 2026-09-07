"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  XCircle,
  Monitor,
  Trash2,
  Plus,
  Laptop,
  Cloud,
  Copy,
  Terminal,
  Check,
  LayoutGrid,
  List,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { ProviderIcon } from "@/components/provider-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

interface Runtime {
  kind: string;
  executable_path?: string;
  version?: string;
  max_concurrency: number;
  status?: string;
  diagnostics?: string;
}

interface Daemon {
  id: string;
  name: string;
  status: string;
  os: string;
  arch: string;
  daemon_version: string;
  last_seen_at: string | null;
  registered_at: string;
  runtimes: Runtime[];
}

type ViewMode = "cards" | "list";
type SortKey = "name" | "last_seen";

const VIEW_KEY = "gitsquad_daemons_view";

export default function DaemonsPage() {
  const [daemons, setDaemons] = useState<Daemon[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [copied, setCopied] = useState("");
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "list" || saved === "cards") return saved;
    }
    return "cards";
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_seen");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const fetchDaemons = () => {
      api
        .get<Daemon[]>("/api/v1/daemons")
        .then((data) => setDaemons(data || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    fetchDaemons();
    const interval = setInterval(fetchDaemons, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/v1/daemons/${id}`);
      setDaemons((prev) => prev.filter((d) => d.id !== id));
      toast.success("Daemon removed");
    } catch {
      toast.error("Failed to remove daemon");
    }
    setDeleting(null);
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return daemons;
    return daemons.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.os.toLowerCase().includes(q) ||
        d.arch.toLowerCase().includes(q) ||
        d.daemon_version.toLowerCase().includes(q) ||
        (d.runtimes || []).some((r) => r.kind.toLowerCase().includes(q)),
    );
  }, [daemons, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = sortKey === "name" ? a.name : a.last_seen_at || "";
      const bv = sortKey === "name" ? b.name : b.last_seen_at || "";
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-8 pt-8">
          <Skeleton className="h-5 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 px-8 py-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-hairline bg-canvas p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-2.5 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-4 w-14" />
              </div>
              <Skeleton className="mt-3 h-3 w-2/3" />
              <Skeleton className="mt-3 h-4 w-full" />
              <div className="mt-4 flex items-center justify-between">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 px-8 pt-8">
        <h1 className="text-sm font-medium text-ink">Daemons</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search daemons…"
              className="h-8 w-56 pl-8"
            />
          </div>
          <ViewSwitcher view={view} onChange={setView} />
          <Button onClick={() => setShowConnect(true)}>
            <Plus className="size-4" />
            Connect Daemon
          </Button>
        </div>
      </div>

      {daemons.length === 0 ? (
        <Empty className="pb-16">
          <EmptyMedia>
            <Monitor className="size-5" />
          </EmptyMedia>
          <EmptyTitle>No daemons registered yet</EmptyTitle>
          <EmptyDescription>
            Run{" "}
            <code className="rounded-sm bg-muted px-1 font-mono text-xs">
              gitsquad daemon login
            </code>{" "}
            on your machine to register a daemon.
          </EmptyDescription>
          <Button onClick={() => setShowConnect(true)} className="mt-1">
            Connect your first daemon
          </Button>
        </Empty>
      ) : sorted.length === 0 ? (
        <Empty className="pb-16">
          <EmptyMedia>
            <Search className="size-5" />
          </EmptyMedia>
          <EmptyTitle>No daemons match</EmptyTitle>
          <EmptyDescription>Try a different search term.</EmptyDescription>
        </Empty>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 px-8 py-6 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((d) => (
            <DaemonCard
              key={d.id}
              daemon={d}
              deleting={deleting === d.id}
              onRequestDelete={() =>
                setDeleting(deleting === d.id ? null : d.id)
              }
              onConfirmDelete={() => handleDelete(d.id)}
            />
          ))}
        </div>
      ) : (
        <DaemonTable
          daemons={sorted}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          deleting={deleting}
          onRequestDelete={setDeleting}
          onConfirmDelete={handleDelete}
        />
      )}

      {showConnect && <ConnectDaemonModal onClose={() => setShowConnect(false)} copied={copied} onCopy={handleCopy} />}
    </div>
  );
}

function ViewSwitcher({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const item = (v: ViewMode, Icon: typeof LayoutGrid, label: string) => (
    <button
      onClick={() => onChange(v)}
      title={label}
      aria-label={`${label} view`}
      className={`flex size-7 items-center justify-center rounded-sm transition-colors ${
        view === v ? "bg-muted text-ink" : "text-mute hover:text-ink"
      }`}
    >
      <Icon className="size-3.5" />
    </button>
  );
  return (
    <div className="flex items-center rounded-sm border border-hairline bg-canvas p-0.5">
      {item("cards", LayoutGrid, "Cards")}
      {item("list", List, "List")}
    </div>
  );
}

function DaemonStatusPill({ status }: { status: string }) {
  const online = status === "online";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        online ? "bg-success/10 text-success" : "bg-muted text-mute"
      }`}
    >
      {status}
    </span>
  );
}

function RuntimeChips({ runtimes }: { runtimes: Runtime[] }) {
  const list = Array.isArray(runtimes) ? runtimes : [];
  if (list.length === 0) {
    return <span className="text-xs text-mute">No capabilities reported.</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((c) => {
        const label = [c.kind, c.version].filter(Boolean).join(" ");
        const title =
          c.status === "error" && c.diagnostics
            ? `${label} — ${c.diagnostics}`
            : label;
        return (
          <span
            key={c.kind}
            title={title}
            className="inline-flex size-6 items-center justify-center rounded-sm bg-muted"
          >
            <ProviderIcon provider={c.kind} className="size-3.5" />
          </span>
        );
      })}
    </div>
  );
}

function RemoveDaemon({
  deleting,
  onConfirm,
  onToggle,
}: {
  deleting: boolean;
  onConfirm: () => void;
  onToggle: () => void;
}) {
  if (deleting) {
    return (
      <span className="flex items-center gap-1.5 text-xs">
        <span className="text-destructive">Remove?</span>
        <button
          onClick={onConfirm}
          className="font-medium text-destructive hover:underline"
        >
          Yes
        </button>
        <button onClick={onToggle} className="text-mute hover:text-body">
          No
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={onToggle}
      className="text-hairline-strong transition-colors hover:text-destructive"
      title="Remove daemon"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

function DaemonCard({
  daemon,
  deleting,
  onRequestDelete,
  onConfirmDelete,
}: {
  daemon: Daemon;
  deleting: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-hairline bg-canvas p-4 shadow-level-2 transition-colors hover:border-hairline-strong">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`size-2.5 shrink-0 rounded-full ${
              daemon.status === "online" ? "bg-success" : "bg-hairline-strong"
            }`}
          />
          <p className="truncate text-sm font-medium text-ink">{daemon.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DaemonStatusPill status={daemon.status} />
          <RemoveDaemon
            deleting={deleting}
            onConfirm={onConfirmDelete}
            onToggle={onRequestDelete}
          />
        </div>
      </div>

      <p className="mt-1 text-xs text-mute">
        {daemon.os}/{daemon.arch} · v{daemon.daemon_version}
      </p>

      <div className="mt-3 border-t border-hairline pt-3">
        <p className="mb-2 font-mono text-xs font-semibold uppercase text-mute">
          Runtimes
        </p>
        <RuntimeChips runtimes={daemon.runtimes} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-mute">
        <span>Last seen: {timeAgo(daemon.last_seen_at)}</span>
        <span className="font-mono">{daemon.id.slice(0, 8)}</span>
      </div>
    </div>
  );
}

function SortIndicator({
  column,
  sortKey,
  sortDir,
}: {
  column: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
}) {
  if (sortKey !== column) return null;
  return sortDir === "asc" ? (
    <ArrowUp className="size-3" />
  ) : (
    <ArrowDown className="size-3" />
  );
}

function DaemonTable({
  daemons,
  sortKey,
  sortDir,
  onSort,
  deleting,
  onRequestDelete,
  onConfirmDelete,
}: {
  daemons: Daemon[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  deleting: string | null;
  onRequestDelete: (id: string | null) => void;
  onConfirmDelete: (id: string) => void;
}) {
  const th =
    "px-4 py-2 text-left font-mono text-xs font-medium uppercase tracking-wide text-mute";

  return (
    <div className="px-8 py-6">
      <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-canvas-soft">
              <th className={th}>
                <button
                  onClick={() => onSort("name")}
                  className="inline-flex items-center gap-1 text-mute transition-colors hover:text-ink"
                >
                  Name
                  <SortIndicator
                    column="name"
                    sortKey={sortKey}
                    sortDir={sortDir}
                  />
                </button>
              </th>
              <th className={th}>Status</th>
              <th className={th}>Platform</th>
              <th className={th}>Runtimes</th>
              <th className={th}>
                <button
                  onClick={() => onSort("last_seen")}
                  className="inline-flex items-center gap-1 text-mute transition-colors hover:text-ink"
                >
                  Last seen
                  <SortIndicator
                    column="last_seen"
                    sortKey={sortKey}
                    sortDir={sortDir}
                  />
                </button>
              </th>
              <th className={`${th} text-right`}></th>
            </tr>
          </thead>
          <tbody>
            {daemons.map((d) => (
              <tr
                key={d.id}
                className="border-b border-hairline last:border-b-0 transition-colors hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        d.status === "online"
                          ? "bg-success"
                          : "bg-hairline-strong"
                      }`}
                    />
                    <span className="truncate font-medium text-ink">{d.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <DaemonStatusPill status={d.status} />
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-body">
                    {d.os}/{d.arch}
                  </span>
                </td>
                <td className="max-w-0 px-4 py-3">
                  <RuntimeChips runtimes={d.runtimes} />
                </td>
                <td className="px-4 py-3 font-mono text-xs tabular-nums text-mute">
                  {timeAgo(d.last_seen_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <RemoveDaemon
                    deleting={deleting === d.id}
                    onConfirm={() => onConfirmDelete(d.id)}
                    onToggle={() =>
                      onRequestDelete(deleting === d.id ? null : d.id)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConnectDaemonModal({
  onClose,
  copied,
  onCopy,
}: {
  onClose: () => void;
  copied: string;
  onCopy: (text: string, id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="mx-4 w-full max-w-lg rounded-lg border border-hairline bg-canvas shadow-level-5" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Connect a daemon</h2>
          <button onClick={onClose} className="text-mute hover:text-ink">
            <XCircle className="size-5" />
          </button>
        </div>

        {/* Options */}
        <div className="space-y-4 p-6">
          {/* Local */}
          <div className="rounded-md border border-hairline p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-sm bg-muted">
                <Laptop className="size-4 text-ink" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Local machine</p>
                <p className="text-xs text-mute">Run on your own hardware</p>
              </div>
            </div>
            <div className="space-y-2 rounded-sm bg-muted p-3 font-mono text-xs text-body">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Terminal className="size-3" />
                  Step 1: Install GitSquad CLI
                </span>
                <button
                  onClick={() => onCopy("curl -fsSL https://raw.githubusercontent.com/feifeifeimoon/GitSquad/main/scripts/install.sh | bash", "install")}
                  className="text-mute hover:text-ink"
                >
                  {copied === "install" ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                </button>
              </div>
              <p className="text-mute">curl -fsSL https://raw.githubusercontent.com/feifeifeimoon/GitSquad/main/scripts/install.sh | bash</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Terminal className="size-3" />
                  Step 2: Login
                </span>
                <button
                  onClick={() => onCopy("gitsquad daemon login", "login")}
                  className="text-mute hover:text-ink"
                >
                  {copied === "login" ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                </button>
              </div>
              <p className="text-mute">gitsquad daemon login</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Terminal className="size-3" />
                  Step 3: Start the daemon
                </span>
                <button
                  onClick={() => onCopy("gitsquad daemon run", "run")}
                  className="text-mute hover:text-ink"
                >
                  {copied === "run" ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                </button>
              </div>
              <p className="text-mute">gitsquad daemon run</p>
            </div>
          </div>

          {/* Cloud */}
          <div className="pointer-events-none rounded-md border border-dashed border-hairline p-4 opacity-60">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-sm bg-muted">
                <Cloud className="size-4 text-mute" />
              </div>
              <div>
                <p className="text-sm font-semibold text-mute">Cloud sandbox</p>
                <p className="text-xs text-mute">Coming soon</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
