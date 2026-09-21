"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  Copy,
  Monitor,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import { daemonApi, type DaemonAgent, type DaemonDetail, type DaemonRuntimeDetail } from "@/lib/api";
import {
  agentStatusWithDaemon,
  workloadDetail,
  type DaemonStatus,
} from "@/lib/agent-status";
import { paths } from "@/lib/paths";
import { timeAgo } from "@/lib/time";
import { ProviderIcon } from "@/components/provider-icon";
import { AgentStatusBadge, DaemonStatusBadge } from "@/components/status-dot";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { Field } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function DaemonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [daemon, setDaemon] = useState<DaemonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(
    () =>
      daemonApi
        .get(id)
        .then(setDaemon)
        .finally(() => setLoading(false)),
    [id],
  );

  // A daemon that no longer exists (or is no longer ours) is worth leaving the
  // page for; a blip on the poll below is not.
  useEffect(() => {
    load().catch(() => router.push(paths.daemons()));
  }, [load, router]);

  // Liveness is decided by the server, so this page has to keep asking it — the
  // answer changes on the machine's schedule, not on the render's.
  useEffect(() => {
    const interval = setInterval(() => {
      load().catch(() => {});
    }, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading || !daemon) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1.5 border-b border-hairline px-8 py-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="px-8 py-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-sm" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
          <div className="mt-8 space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const status = daemon.status;
  const agentCount = daemon.runtimes.reduce((n, r) => n + r.agents.length, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-hairline px-8 py-4 text-sm">
        <Link
          href={paths.daemons()}
          className="text-mute transition-colors hover:text-ink"
        >
          Daemons
        </Link>
        <ChevronRight className="size-3.5 shrink-0 text-hairline-strong" />
        <span className="truncate font-medium text-ink">{daemon.name}</span>
      </div>

      <div className="flex-1 px-8 pb-12 pt-6">
        <header className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-hairline bg-canvas-soft">
            <Monitor className="size-5 text-body" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-ink">
                {daemon.name}
              </h1>
              <button
                onClick={() => setRenaming(true)}
                className="text-hairline-strong transition-colors hover:text-ink"
                title="Rename daemon"
                aria-label="Rename daemon"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">
              <DaemonStatusBadge status={status} />
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                {daemon.os}/{daemon.arch}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">v{daemon.daemon_version}</span>
              <span aria-hidden="true">·</span>
              <span>Last seen {timeAgo(daemon.last_seen_at)}</span>
            </p>
          </div>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-hairline py-5 sm:grid-cols-4">
          <Fact label="Runtimes" value={String(daemon.runtimes.length)} />
          <Fact label="Agents" value={String(agentCount)} />
          <Fact
            label="Connected"
            value={daemon.connected_at ? timeAgo(daemon.connected_at) : "never"}
          />
          <Fact
            label="Registered"
            value={timeAgo(daemon.registered_at)}
          />
          <Fact label="Daemon ID" value={daemon.id} mono copyable />
        </dl>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-ink">Runtimes</h2>
            <span className="text-xs text-mute">
              Detected on this machine and reported by the daemon.
            </span>
          </div>

          {daemon.runtimes.length === 0 ? (
            <Empty className="rounded-lg border border-dashed border-hairline bg-canvas-soft py-12">
              <EmptyMedia>
                <Monitor className="size-5" />
              </EmptyMedia>
              <EmptyTitle>No runtimes reported</EmptyTitle>
              <EmptyDescription>
                The daemon could not find a supported provider CLI on this
                machine.
              </EmptyDescription>
            </Empty>
          ) : (
            <div className="space-y-3">
              {daemon.runtimes.map((runtime) => (
                <RuntimeCard
                  key={runtime.id || runtime.kind}
                  runtime={runtime}
                  daemon={status}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {renaming && (
        <RenameDialog
          onClose={() => setRenaming(false)}
          daemonId={daemon.id}
          currentName={daemon.name}
          onRenamed={(name) => {
            setDaemon((d) => (d ? { ...d, name } : d));
            toast.success("Daemon renamed");
          }}
        />
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <dt className="font-mono text-xs font-semibold uppercase tracking-wide text-mute">
        {label}
      </dt>
      <dd className="mt-1 flex min-w-0 items-center gap-1.5">
        <span
          className={`truncate text-sm text-ink ${mono ? "font-mono text-xs" : ""}`}
          title={value}
        >
          {value}
        </span>
        {copyable && (
          <button
            onClick={async () => {
              await navigator.clipboard?.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="shrink-0 text-hairline-strong transition-colors hover:text-ink"
            title="Copy"
            aria-label={`Copy ${label}`}
          >
            {copied ? (
              <Check className="size-3 text-success" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        )}
      </dd>
    </div>
  );
}

function RuntimeCard({
  runtime,
  daemon,
}: {
  runtime: DaemonRuntimeDetail;
  /** The machine's derived liveness — every agent on it shares this. */
  daemon: DaemonStatus;
}) {
  const failed = runtime.status === "error";
  return (
    <div className="rounded-lg border border-hairline bg-canvas shadow-level-2">
      <div className="flex items-start gap-3 p-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted">
          <ProviderIcon provider={runtime.kind} className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-medium text-ink">{runtime.kind}</h3>
            <span className="font-mono text-xs text-body">
              {runtime.version || "version unknown"}
            </span>
            {failed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-error-soft px-2 py-0.5 text-xs font-medium text-destructive">
                <TriangleAlert className="size-3" />
                unavailable
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-body">
                {runtime.status || "available"}
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-mute">
            <span
              className="truncate font-mono"
              title={runtime.executable_path}
            >
              {runtime.executable_path || "path unknown"}
            </span>
            <span aria-hidden="true">·</span>
            <span>max {runtime.max_concurrency} concurrent</span>
          </p>
          {failed && runtime.diagnostics && (
            <p className="mt-2 rounded-sm bg-error-soft px-2 py-1.5 font-mono text-xs text-destructive">
              {runtime.diagnostics}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-hairline px-4 py-3">
        <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-mute">
          Agents ({runtime.agents.length})
        </p>
        {runtime.agents.length === 0 ? (
          <p className="text-xs text-mute">
            No agents are bound to this runtime.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {runtime.agents.map((agent) => (
              <AgentRow key={agent.id} agent={agent} daemon={daemon} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AgentRow({
  agent,
  daemon,
}: {
  agent: DaemonAgent;
  daemon: DaemonStatus;
}) {
  const status = agentStatusWithDaemon(daemon, agent);
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <WorkspaceAvatar
        name={agent.name}
        avatarUrl={agent.avatar_url}
        className="size-7"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={paths.workspace(agent.workspace_slug).agents()}
            className="truncate text-sm font-medium text-ink hover:underline"
          >
            @{agent.name}
          </Link>
          {!agent.enabled && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-mute">
              disabled
            </span>
          )}
        </div>
        <p className="truncate text-xs text-mute">
          {agent.workspace_name}
          {agent.model ? ` · ${agent.model}` : ""}
          {agent.total_runs > 0 ? ` · ${agent.total_runs} runs` : ""}
        </p>
      </div>
      <AgentStatusBadge
        status={status}
        detail={workloadDetail(agent)}
        className="max-w-56 shrink-0 justify-end"
      />
    </li>
  );
}

function RenameDialog({
  onClose,
  daemonId,
  currentName,
  onRenamed,
}: {
  onClose: () => void;
  daemonId: string;
  currentName: string;
  onRenamed: (name: string) => void;
}) {
  // Mounted only while open, so the field starts from the daemon's current name
  // and a cancelled edit is never still sitting there next time.
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const next = name.trim();
    if (!next) return toast.error("Name is required");
    if (next === currentName) return onClose();
    setSaving(true);
    try {
      await daemonApi.rename(daemonId, next);
      onRenamed(next);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename daemon");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="text-base font-semibold text-ink">
          Rename daemon
        </DialogTitle>
        <div className="mt-4 space-y-4">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              maxLength={64}
              autoFocus
              placeholder="My laptop"
            />
            <p className="mt-1.5 text-xs text-mute">
              A label for this machine in the console. The daemon itself is
              unaffected.
            </p>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={submit}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
