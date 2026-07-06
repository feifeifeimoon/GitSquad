"use client";

import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

function DaemonAuthContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code") || "";

  const [status, setStatus] = useState<"loading" | "need_login" | "confirm" | "confirming" | "confirmed" | "error">(() => {
    if (typeof window === "undefined") return "loading";
    return localStorage.getItem("gitsquad_token") ? "loading" : "need_login";
  });
  const [error, setError] = useState("");
  const [machineName, setMachineName] = useState("");

  // Check auth and fetch pairing info on mount.
  useEffect(() => {
    const token = localStorage.getItem("gitsquad_token");
    if (!token) {
      queueMicrotask(() => setStatus("need_login"));
      return;
    }
    let cancelled = false;
    api
      .get<{ status: string; machine_name: string }>(`/api/v1/daemon/auth/${code}`)
      .then((data) => {
        if (cancelled) return;
        setMachineName(data.machine_name || "Unknown device");
        setStatus("confirm");
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("gitsquad_token");
        queueMicrotask(() => setStatus("need_login"));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async () => {
    setStatus("confirming");
    try {
      await api.post(`/api/v1/daemon/auth/${code}/confirm`);
      setStatus("confirmed");
    } catch (err: unknown) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to confirm pairing.");
    }
  };

  const codeParts = code ? code.split("-") : [];

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex size-12 items-center justify-center rounded-xl bg-zinc-950 mx-auto mb-4">
              <Image src="/favicon.ico" alt="GitSquad" width={22} height={22} className="size-[22px]" />
            </div>
            <h1 className="text-xl font-bold text-zinc-950">Device Activation</h1>
          </div>

          {/* Need login */}
          {status === "need_login" && (
            <div className="text-center space-y-5">
              <p className="text-sm text-zinc-500">
                Log in with your Google account to connect a daemon to GitSquad.
              </p>
              <button
                onClick={() => router.push(`/login?return=${encodeURIComponent(`/daemon/auth?code=${code}`)}`)}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors w-full justify-center"
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Login with Google
              </button>
            </div>
          )}

          {/* Loading */}
          {status === "loading" && (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 text-zinc-400 animate-spin" />
            </div>
          )}

          {/* Confirm */}
          {(status === "confirm" || status === "confirming") && (
            <div className="space-y-6">
              {/* Pairing code */}
              <div>
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider text-center mb-3">
                  Verification Code
                </p>
                <div className="flex items-center justify-center gap-2">
                  {codeParts.map((part, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {part.split("").map((ch, j) => (
                          <span
                            key={j}
                            className="flex size-10 items-center justify-center rounded-lg border-2 border-zinc-200 bg-zinc-50 text-lg font-bold text-zinc-950 uppercase"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                      {i < codeParts.length - 1 && (
                        <span className="text-zinc-300 font-bold text-lg">—</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Device info */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center">
                <p className="text-xs text-zinc-400 mb-1">Device</p>
                <p className="text-sm font-semibold text-zinc-950">{machineName}</p>
              </div>

              <p className="text-xs text-zinc-400 text-center">
                This device will be able to execute tasks on your behalf.
              </p>

              <button
                onClick={handleConfirm}
                disabled={status === "confirming"}
                className="w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {status === "confirming" ? "Confirming..." : "Authorize Device"}
              </button>
            </div>
          )}

          {/* Confirmed */}
          {status === "confirmed" && (
            <div className="text-center space-y-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-green-100 mx-auto">
                <Check className="size-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-950">Device Connected</h2>
                <p className="text-sm text-zinc-500 mt-1">
                  You can close this page and return to your terminal.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="text-center space-y-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-red-100 mx-auto">
                <span className="text-xl font-bold text-red-600">!</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-950">Verification Failed</h2>
                <p className="text-sm text-zinc-500 mt-1">{error}</p>
              </div>
              <a
                href="/login"
                className="inline-block text-sm text-zinc-500 hover:text-zinc-950 transition-colors"
              >
                Back to login
              </a>
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-400 text-center mt-4">
          GitSquad — Autonomous developer team on GitHub
        </p>
      </div>
    </main>
  );
}

export default function DaemonAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50">
          <Loader2 className="size-6 text-zinc-400 animate-spin" />
        </div>
      }
    >
      <DaemonAuthContent />
    </Suspense>
  );
}
