"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Monitor, Cpu, Trash2, Plus, Laptop, Cloud, Copy, Terminal, Check } from "lucide-react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface Runtime {
  kind: string;
  executable_path?: string;
  version?: string;
  max_concurrency: number;
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

export default function DaemonsPage() {
  const [daemons, setDaemons] = useState<Daemon[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [copied, setCopied] = useState("");

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

  if (loading) {
    return (
      <div className="px-8 pb-8 pt-8">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="mb-8 grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md border border-hairline bg-canvas p-4 shadow-level-2"
            >
              <Skeleton className="h-4 w-16" />
              <Skeleton className="mt-3 h-7 w-10" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md border border-hairline bg-canvas p-5 shadow-level-2"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-2.5 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="ml-auto h-4 w-14" />
              </div>
              <Skeleton className="mt-3 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 pt-8 pb-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-sm font-medium text-ink">Daemons</h1>
        <Button onClick={() => setShowConnect(true)}>
          <Plus className="size-4" />
          Connect Daemon
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-md border border-hairline bg-canvas p-4 shadow-level-2">
          <div className="mb-1 flex items-center gap-2 text-sm text-body">
            <Monitor className="size-4" />
            Total
          </div>
          <p className="text-2xl font-semibold text-ink">{daemons.length}</p>
        </div>
        <div className="rounded-md border border-hairline bg-canvas p-4 shadow-level-2">
          <div className="mb-1 flex items-center gap-2 text-sm text-body">
            <CheckCircle2 className="size-4 text-success" />
            Online
          </div>
          <p className="text-2xl font-semibold text-ink">
            {daemons.filter((d) => d.status === "online").length}
          </p>
        </div>
        <div className="rounded-md border border-hairline bg-canvas p-4 shadow-level-2">
          <div className="mb-1 flex items-center gap-2 text-sm text-body">
            <Cpu className="size-4" />
            Runtimes
          </div>
          <p className="text-2xl font-semibold text-ink">
            {daemons.reduce((s, d) => s + (Array.isArray(d.runtimes) ? d.runtimes.length : 0), 0)}
          </p>
        </div>
      </div>

      {daemons.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg bg-canvas-soft py-16 text-center">
          <Monitor className="mb-3 size-6 text-mute" />
          <p className="text-sm font-medium text-ink">No daemons registered yet</p>
          <p className="mt-1 text-sm text-body">
            Run <code className="rounded-sm bg-muted px-1 font-mono text-xs">gitsquad daemon login</code> on your machine
            to register a daemon.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {daemons.map((d) => (
            <div key={d.id} className="overflow-hidden rounded-md border border-hairline bg-canvas shadow-level-2">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4">
                <span
                  className={`size-2.5 rounded-full ${
                    d.status === "online" ? "bg-success" : "bg-hairline-strong"
                  }`}
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">{d.name}</p>
                  <p className="text-xs text-mute">
                    {d.os}/{d.arch} · v{d.daemon_version} · registered {timeAgo(d.registered_at)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    d.status === "online"
                      ? "bg-success/10 text-success"
                      : "bg-muted text-mute"
                  }`}
                >
                  {d.status}
                </span>
              </div>

              {/* Capabilities */}
              <div className="border-t border-hairline px-5 py-3">
                <p className="mb-2 font-mono text-xs font-semibold uppercase text-mute">
                  Runtimes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(Array.isArray(d.runtimes) ? d.runtimes : []).length === 0 ? (
                    <span className="text-xs text-mute">No capabilities reported.</span>
                  ) : (
                    (Array.isArray(d.runtimes) ? d.runtimes : [])
                      .map((c) => (
                        <span
                          key={c.kind}
                          className="inline-flex items-center gap-1 rounded-sm bg-success/10 px-2 py-1 text-xs font-medium text-success"
                        >
                          <CheckCircle2 className="size-3" />
                          {c.kind}
                          {c.version && (
                            <span className="text-xs opacity-60">{c.version}</span>
                          )}
                        </span>
                      ))
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-hairline px-5 py-2 text-xs text-mute">
                <span>
                  Last seen: {timeAgo(d.last_seen_at)}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">{d.id.slice(0, 8)}</span>
                  {deleting === d.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-destructive">Remove?</span>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="font-medium text-destructive hover:underline"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeleting(null)}
                        className="text-mute hover:text-body"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setDeleting(d.id)}
                      className="text-hairline-strong transition-colors hover:text-destructive"
                      title="Remove daemon"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect Daemon Modal */}
      {showConnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setShowConnect(false)}>
          <div className="mx-4 w-full max-w-lg rounded-lg border border-hairline bg-canvas shadow-level-5" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-base font-semibold text-ink">Connect a daemon</h2>
              <button onClick={() => setShowConnect(false)} className="text-mute hover:text-ink">
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
                      onClick={() => handleCopy("curl -fsSL https://raw.githubusercontent.com/feifeifeimoon/GitSquad/main/scripts/install.sh | bash", "install")}
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
                      onClick={() => handleCopy("gitsquad daemon login", "login")}
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
                      onClick={() => handleCopy("gitsquad daemon run", "run")}
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
      )}
    </div>
  );
}
