"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Monitor,
  Plus,
  Laptop,
  Cloud,
  Copy,
  Terminal,
  Check,
  Search,
} from "lucide-react";
import { daemonApi, type Daemon, type DaemonRuntime } from "@/lib/api";
import { STATUS_DOT } from "@/lib/agent-status";
import { DaemonStatusBadge } from "@/components/status-dot";
import { paths } from "@/lib/paths";
import { timeAgo } from "@/lib/time";
import { ProviderIcon } from "@/components/provider-icon";
import { PageHeader, PageHeaderSkeleton } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { invalidateApi, setApiData, useApi } from "@/lib/query";
import { ViewSwitcher, useViewMode } from "@/components/view-switcher";
import { SortHeader, TH_CLASS, useSort, type SortState } from "@/components/table-sort";
import { InlineConfirm } from "@/components/inline-confirm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

type SortKey = "name" | "last_seen";

const VIEW_KEY = "gitsquad_daemons_view";

export default function DaemonsPage() {
  const {
    data: daemons,
    loading,
    error,
    refresh,
  } = useApi<Daemon[]>("/api/v1/daemons", () => daemonApi.list());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [copied, setCopied] = useState("");
  const [view, setView] = useViewMode(VIEW_KEY);
  const [search, setSearch] = useState("");
  const { sort, toggle: toggleSort } = useSort<SortKey>(
    { key: "last_seen", dir: "desc" },
    "name",
  );

  // Liveness is decided by the server, so this page has to keep asking — the
  // answer changes on the machine's schedule, not on the render's. It
  // invalidates rather than fetching, so anything else reading a daemon (the
  // detail page, an agent row) is refreshed by the same tick.
  useEffect(() => {
    const interval = setInterval(() => invalidateApi("/api/v1/daemons"), 15_000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await daemonApi.remove(id);
      setApiData<Daemon[]>("/api/v1/daemons", (prev = []) =>
        prev.filter((d) => d.id !== id),
      );
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
    if (!q) return daemons ?? [];
    return (daemons ?? []).filter(
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
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = sort.key === "name" ? a.name : a.last_seen_at || "";
      const bv = sort.key === "name" ? b.name : b.last_seen_at || "";
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return arr;
  }, [filtered, sort]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeaderSkeleton
          actions={
            <>
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-32" />
            </>
          }
        />
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
      <PageHeader
        title="Daemons"
        actions={
          <>
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
          </>
        }
      />

      {error ? (
        <div className="px-8 py-6">
          <ErrorState what="your daemons" error={error} onRetry={refresh} />
        </div>
      ) : (daemons ?? []).length === 0 ? (
        <Empty className="pb-16">
          <EmptyMedia>
            <Monitor className="size-5" />
          </EmptyMedia>
          <EmptyTitle>No daemons registered yet</EmptyTitle>
          <EmptyDescription>
            Run{" "}
            <code className="rounded-sm bg-muted px-1 font-mono text-caption">
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
          sort={sort}
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

function RuntimeChips({ runtimes }: { runtimes: DaemonRuntime[] }) {
  const list = Array.isArray(runtimes) ? runtimes : [];
  if (list.length === 0) {
    return <span className="text-caption text-mute">No capabilities reported.</span>;
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
            className={`size-2.5 shrink-0 rounded-full ${STATUS_DOT[daemon.status]}`}
          />
          <Link
            href={paths.daemon(daemon.id)}
            className="truncate text-copy font-medium text-ink hover:underline"
          >
            {daemon.name}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DaemonStatusBadge status={daemon.status} />
          <InlineConfirm
            confirming={deleting}
            question="Remove?"
            title="Remove daemon"
            onRequest={onRequestDelete}
            onConfirm={onConfirmDelete}
            onCancel={onRequestDelete}
          />
        </div>
      </div>

      <p className="mt-1 text-caption text-mute">
        {daemon.os}/{daemon.arch} · v{daemon.daemon_version}
      </p>

      <div className="mt-3 border-t border-hairline pt-3">
        <p className="mb-2 font-mono text-caption font-semibold uppercase text-mute">
          Runtimes
        </p>
        <RuntimeChips runtimes={daemon.runtimes} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-caption text-mute">
        <span>Last seen: {timeAgo(daemon.last_seen_at)}</span>
        <span className="font-mono">{daemon.id.slice(0, 8)}</span>
      </div>
    </div>
  );
}

function DaemonTable({
  daemons,
  sort,
  onSort,
  deleting,
  onRequestDelete,
  onConfirmDelete,
}: {
  daemons: Daemon[];
  sort: SortState<SortKey>;
  onSort: (key: SortKey) => void;
  deleting: string | null;
  onRequestDelete: (id: string | null) => void;
  onConfirmDelete: (id: string) => void;
}) {
  return (
    <div className="px-8 py-6">
      <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
        <table className="w-full border-collapse text-copy">
          <thead>
            <tr className="border-b border-hairline bg-canvas-soft">
              <SortHeader label="Name" column="name" sort={sort} onSort={onSort} />
              <th className={TH_CLASS}>Status</th>
              <th className={TH_CLASS}>Platform</th>
              <th className={TH_CLASS}>Runtimes</th>
              <SortHeader
                label="Last seen"
                column="last_seen"
                sort={sort}
                onSort={onSort}
              />
              <th className={`${TH_CLASS} text-right`}></th>
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
                      className={`size-2 shrink-0 rounded-full ${STATUS_DOT[d.status]}`}
                    />
                    <Link
                      href={paths.daemon(d.id)}
                      className="truncate font-medium text-ink hover:underline"
                    >
                      {d.name}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <DaemonStatusBadge status={d.status} />
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-caption text-body">
                    {d.os}/{d.arch}
                  </span>
                </td>
                <td className="max-w-0 px-4 py-3">
                  <RuntimeChips runtimes={d.runtimes} />
                </td>
                <td className="px-4 py-3 font-mono text-caption tabular-nums text-mute">
                  {timeAgo(d.last_seen_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <InlineConfirm
                    confirming={deleting === d.id}
                    question="Remove?"
                    title="Remove daemon"
                    onRequest={() => onRequestDelete(d.id)}
                    onConfirm={() => onConfirmDelete(d.id)}
                    onCancel={() => onRequestDelete(null)}
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

/** One copyable install step: the label, and the command it stands for. */
function ConnectStep({
  label,
  command,
  id,
  copied,
  onCopy,
}: {
  label: string;
  command: string;
  id: string;
  copied: string;
  onCopy: (text: string, id: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Terminal className="size-3" />
          {label}
        </span>
        <button
          onClick={() => onCopy(command, id)}
          aria-label={`Copy ${label}`}
          className="text-mute hover:text-ink"
        >
          {copied === id ? (
            <Check className="size-3 text-success" />
          ) : (
            <Copy className="size-3" />
          )}
        </button>
      </div>
      <p className="text-mute">{command}</p>
    </>
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle className="pr-8 text-base font-semibold text-ink">
          Connect a daemon
        </DialogTitle>

        <div className="space-y-4">
          {/* Local */}
          <div className="rounded-md border border-hairline p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-sm bg-muted">
                <Laptop className="size-4 text-ink" />
              </div>
              <div>
                <p className="text-copy font-semibold text-ink">Local machine</p>
                <p className="text-caption text-mute">Run on your own hardware</p>
              </div>
            </div>
            <div className="space-y-2 rounded-sm bg-muted p-3 font-mono text-caption text-body">
              <ConnectStep
                label="Step 1: Install GitSquad CLI"
                command="curl -fsSL https://raw.githubusercontent.com/feifeifeimoon/GitSquad/main/scripts/install.sh | bash"
                id="install"
                copied={copied}
                onCopy={onCopy}
              />
              <ConnectStep
                label="Step 2: Login"
                command="gitsquad daemon login"
                id="login"
                copied={copied}
                onCopy={onCopy}
              />
              <ConnectStep
                label="Step 3: Start the daemon"
                command="gitsquad daemon run"
                id="run"
                copied={copied}
                onCopy={onCopy}
              />
            </div>
          </div>

          {/* Cloud */}
          <div className="pointer-events-none rounded-md border border-dashed border-hairline p-4 opacity-60">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-sm bg-muted">
                <Cloud className="size-4 text-mute" />
              </div>
              <div>
                <p className="text-copy font-semibold text-mute">Cloud sandbox</p>
                <p className="text-caption text-mute">Coming soon</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
