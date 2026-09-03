"use client";

import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Check, Loader2, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  const [userAvatar, setUserAvatar] = useState("");
  const [userLogin, setUserLogin] = useState("");

  // Check auth and fetch pairing info on mount.
  useEffect(() => {
    const token = localStorage.getItem("gitsquad_token");
    if (!token) {
      queueMicrotask(() => setStatus("need_login"));
      return;
    }
    let cancelled = false;
    // Fetch user info and pairing info in parallel.
    Promise.all([
      api.get<{ avatar_url: string; login: string }>("/api/v1/me"),
      api.get<{ status: string; machine_name: string }>(`/api/v1/daemon/auth/${code}`),
    ])
      .then(([user, pairing]) => {
        if (cancelled) return;
        setUserAvatar(user.avatar_url);
        setUserLogin(user.login);
        setMachineName(pairing.machine_name || "Unknown device");
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
    <main className="flex min-h-screen items-center justify-center bg-canvas-soft p-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-hairline bg-canvas-soft-2 p-8 shadow-level-4">
          {/* Header — connection flow */}
          <div className="mb-8 flex items-center justify-center gap-4">
            <Avatar className="size-14 ring-2 ring-hairline ring-offset-2 ring-offset-canvas-soft-2">
              <AvatarImage src={userAvatar} />
              <AvatarFallback className="text-lg">
                {userLogin?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <ArrowRight className="size-5 text-hairline-strong" />
            <div className="flex size-14 items-center justify-center rounded-md bg-muted ring-2 ring-hairline ring-offset-2 ring-offset-canvas-soft-2">
              <Image src="/favicon.ico" alt="GitSquad" width={28} height={28} className="size-7" />
            </div>
          </div>
          <h1 className="text-center text-xl font-semibold tracking-[-0.04em] text-ink">Device Activation</h1>

          {/* Need login */}
          {status === "need_login" && (
            <div className="space-y-5 text-center">
              <p className="text-sm text-body">
                Log in with your Google account to connect a daemon to GitSquad.
              </p>
              <button
                onClick={() => router.push(`/login?return=${encodeURIComponent(`/daemon/auth?code=${code}`)}`)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/85"
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
              <Loader2 className="size-6 animate-spin text-mute" />
            </div>
          )}

          {/* Confirm */}
          {(status === "confirm" || status === "confirming") && (
            <div className="space-y-6">
              {/* Pairing code */}
              <div>
                <p className="mb-3 text-center font-mono text-xs uppercase tracking-wider text-mute">
                  Verification Code
                </p>
                <div className="flex items-center justify-center gap-2">
                  {codeParts.map((part, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {part.split("").map((ch, j) => (
                          <span
                            key={j}
                            className="flex size-10 items-center justify-center rounded-sm border border-hairline bg-canvas-soft text-lg font-semibold uppercase text-ink"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                      {i < codeParts.length - 1 && (
                        <span className="text-lg font-semibold text-hairline-strong">—</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Device info */}
              <div className="rounded-sm border border-hairline bg-canvas-soft p-4 text-center">
                <p className="mb-1 text-xs text-mute">Device</p>
                <p className="text-sm font-semibold text-ink">{machineName}</p>
              </div>

              <p className="text-center text-xs text-mute">
                This device will be able to execute tasks on your behalf.
              </p>

              <button
                onClick={handleConfirm}
                disabled={status === "confirming"}
                className="w-full rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/85 disabled:opacity-50"
              >
                {status === "confirming" ? "Confirming..." : "Authorize Device"}
              </button>
            </div>
          )}

          {/* Confirmed */}
          {status === "confirmed" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-link/10">
                <Check className="size-6 text-link" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">Device Connected</h2>
                <p className="mt-1 text-sm text-body">
                  You can close this page and return to your terminal.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
                <span className="text-xl font-semibold text-destructive">!</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">Verification Failed</h2>
                <p className="mt-1 text-sm text-body">{error}</p>
              </div>
              <a
                href="/login"
                className="inline-block text-sm text-body transition-colors hover:text-ink"
              >
                Back to login
              </a>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-mute">
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
        <div className="flex min-h-screen items-center justify-center bg-canvas-soft">
          <Loader2 className="size-6 animate-spin text-mute" />
        </div>
      }
    >
      <DaemonAuthContent />
    </Suspense>
  );
}
