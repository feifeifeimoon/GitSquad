"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

function DaemonAuthContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code");

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("gitsquad_token");
  });
  const [status, setStatus] = useState<"loading" | "need_login" | "confirm" | "confirming" | "confirmed" | "error">(() => {
    if (typeof window === "undefined") return "loading";
    return localStorage.getItem("gitsquad_token") ? "loading" : "need_login";
  });
  const [error, setError] = useState("");
  const [machineName, setMachineName] = useState("");

  // Check auth state.
  useEffect(() => {
    const token = localStorage.getItem("gitsquad_token");
    if (!token) return;

    api
      .get<User>("/api/v1/me")
      .then((u) => {
        setUser(u);
        setAuthChecked(true);
      })
      .catch(() => {
        localStorage.removeItem("gitsquad_token");
        setAuthChecked(true);
        setStatus("need_login");
      });
  }, []);

  // Fetch pairing details once auth is confirmed.
  useEffect(() => {
    if (!authChecked || !code || !user) return;

    api
      .get<{ status: string; machine_name: string }>(`/api/v1/daemon/auth/${code}`)
      .then((data) => {
        setMachineName(data.machine_name || "Unknown device");
        setStatus("confirm");
      })
      .catch((err: unknown) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Invalid or expired pairing code.");
      });
  }, [authChecked, code, user]);

  const handleConfirm = useCallback(async () => {
    setStatus("confirming");
    try {
      await api.post(`/api/v1/daemon/auth/${code}/confirm`);
      setStatus("confirmed");
    } catch (err: unknown) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to confirm pairing.");
    }
  }, [code]);

  // ── Need login ──
  if (status === "need_login") {
    const returnURL = `/daemon/auth?code=${code}`;
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white text-zinc-950 px-5 gap-6">
        <h1 className="text-xl font-bold">Connect Daemon</h1>
        <p className="text-sm text-zinc-500 text-center">
          Log in with your Google account to connect this daemon.
        </p>
        <button
          onClick={() => router.push(`/login?return=${encodeURIComponent(returnURL)}`)}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Login with Google
        </button>
      </main>
    );
  }

  // ── Loading ──
  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-zinc-950">
        <div className="animate-spin w-6 h-6 border-2 border-zinc-950 border-t-transparent rounded-full" />
      </main>
    );
  }

  // ── Confirm ──
  if (status === "confirm" || status === "confirming") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white text-zinc-950 px-5 gap-6">
        <h1 className="text-xl font-bold">Connect Daemon</h1>
        <p className="text-sm text-zinc-500 text-center">
          Allow <strong>{machineName}</strong> to access your GitSquad account?
        </p>
        <button
          onClick={handleConfirm}
          disabled={status === "confirming"}
          className="rounded-md bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {status === "confirming" ? "Confirming..." : "Confirm"}
        </button>
      </main>
    );
  }

  // ── Confirmed ──
  if (status === "confirmed") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white text-zinc-950 px-5 gap-4">
        <div className="text-4xl mb-2">✓</div>
        <h1 className="text-xl font-bold">Daemon Connected</h1>
        <p className="text-sm text-zinc-500">
          You can close this page and return to your terminal.
        </p>
      </main>
    );
  }

  // ── Error ──
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white text-zinc-950 px-5 gap-4">
      <p className="text-red-600">{error}</p>
      <a href="/login" className="text-sm text-zinc-500 hover:text-zinc-950 transition-colors">
        Back to login
      </a>
    </main>
  );
}

export default function DaemonAuthPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20 text-zinc-500">Loading...</div>}>
      <DaemonAuthContent />
    </Suspense>
  );
}
