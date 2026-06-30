"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Monitor, Cpu, Trash2, Plus, Laptop, Cloud, Copy, Terminal, Check } from "lucide-react";
import { api } from "@/lib/api";

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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
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
    } catch {
      // ignore
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
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-6 h-6 border-2 border-zinc-950 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Monitor className="size-5 text-zinc-950" />
          <h1 className="text-xl font-bold text-zinc-950">Daemons</h1>
        </div>
        <button
          onClick={() => setShowConnect(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors"
        >
          <Plus className="size-3.5" />
          Connect Daemon
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <Monitor className="size-4" />
            Total
          </div>
          <p className="text-2xl font-bold text-zinc-950">{daemons.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <CheckCircle2 className="size-4 text-emerald-500" />
            Online
          </div>
          <p className="text-2xl font-bold text-zinc-950">
            {daemons.filter((d) => d.status === "online").length}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
            <Cpu className="size-4" />
            Runtimes
          </div>
          <p className="text-2xl font-bold text-zinc-950">
            {daemons.reduce((s, d) => s + (Array.isArray(d.runtimes) ? d.runtimes.length : 0), 0)}
          </p>
        </div>
      </div>

      {daemons.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center">
          <p className="text-sm text-zinc-500 mb-2">No daemons registered yet.</p>
          <p className="text-xs text-zinc-400">
            Run <code className="bg-zinc-100 px-1 rounded">gitsquad daemon login</code> on your machine
            to register a daemon.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {daemons.map((d) => (
            <div key={d.id} className="rounded-lg border border-zinc-200 bg-white">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4">
                <span
                  className={`size-2.5 rounded-full ${
                    d.status === "online" ? "bg-emerald-400" : "bg-zinc-300"
                  }`}
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-zinc-950">{d.name}</p>
                  <p className="text-xs text-zinc-400">
                    {d.os}/{d.arch} · v{d.daemon_version} · registered {timeAgo(d.registered_at)}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    d.status === "online"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {d.status}
                </span>
              </div>

              {/* Capabilities */}
              <div className="border-t border-zinc-100 px-5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Runtimes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(Array.isArray(d.runtimes) ? d.runtimes : []).length === 0 ? (
                    <span className="text-xs text-zinc-400">No capabilities reported.</span>
                  ) : (
                    (Array.isArray(d.runtimes) ? d.runtimes : [])
                      .map((c) => (
                        <span
                          key={c.kind}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700"
                        >
                          <CheckCircle2 className="size-3" />
                          {c.kind}
                          {c.version && (
                            <span className="text-[10px] opacity-60">{c.version}</span>
                          )}
                        </span>
                      ))
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-zinc-100 px-5 py-2 flex items-center justify-between text-[11px] text-zinc-400">
                <span>
                  Last seen: {timeAgo(d.last_seen_at)}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px]">{d.id.slice(0, 8)}</span>
                  {deleting === d.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-red-600">Remove?</span>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="text-red-600 font-medium hover:underline"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeleting(null)}
                        className="text-zinc-400 hover:text-zinc-600"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setDeleting(d.id)}
                      className="text-zinc-300 hover:text-red-500 transition-colors"
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
          <div className="rounded-xl border border-zinc-200 bg-white shadow-2xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h2 className="text-base font-semibold text-zinc-950">Connect a daemon</h2>
              <button onClick={() => setShowConnect(false)} className="text-zinc-400 hover:text-zinc-600">
                <XCircle className="size-5" />
              </button>
            </div>

            {/* Options */}
            <div className="p-6 space-y-4">
              {/* Local */}
              <div className="rounded-lg border border-zinc-200 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-zinc-100">
                    <Laptop className="size-4 text-zinc-950" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-950">Local machine</p>
                    <p className="text-xs text-zinc-400">Run on your own hardware</p>
                  </div>
                </div>
                <div className="space-y-2 rounded-md bg-zinc-50 p-3 text-xs text-zinc-600 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="size-3" />
                      Step 1: Install GitSquad CLI
                    </span>
                    <button
                      onClick={() => handleCopy("curl -fsSL https://gitsquad.com/install | sh", "install")}
                      className="text-zinc-400 hover:text-zinc-600"
                    >
                      {copied === "install" ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                    </button>
                  </div>
                  <p className="text-zinc-500">curl -fsSL https://gitsquad.com/install | sh</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="size-3" />
                      Step 2: Login
                    </span>
                    <button
                      onClick={() => handleCopy("gitsquad daemon login", "login")}
                      className="text-zinc-400 hover:text-zinc-600"
                    >
                      {copied === "login" ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                    </button>
                  </div>
                  <p className="text-zinc-500">gitsquad daemon login</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="size-3" />
                      Step 3: Start the daemon
                    </span>
                    <button
                      onClick={() => handleCopy("gitsquad daemon run", "run")}
                      className="text-zinc-400 hover:text-zinc-600"
                    >
                      {copied === "run" ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                    </button>
                  </div>
                  <p className="text-zinc-500">gitsquad daemon run</p>
                </div>
              </div>

              {/* Cloud */}
              <div className="rounded-lg border border-dashed border-zinc-200 p-4 opacity-60 pointer-events-none">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-zinc-100">
                    <Cloud className="size-4 text-zinc-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-400">Cloud sandbox</p>
                    <p className="text-xs text-zinc-300">Coming soon</p>
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
