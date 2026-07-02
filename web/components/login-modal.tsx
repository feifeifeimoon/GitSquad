"use client";

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface LoginModalProps {
  mode: "modal" | "page";
  open?: boolean;
  onClose?: () => void;
  error?: string | null;
  returnURL?: string;
}

const errorMessages: Record<string, string> = {
  invalid_state: "Session expired. Please try again.",
  token_exchange_failed: "Google authentication failed. Please try again.",
  google_api_failed: "Failed to fetch Google profile. Please try again.",
  internal_error: "An internal error occurred. Please try again later.",
};

export function LoginModal({ mode, open, onClose, error, returnURL }: LoginModalProps) {
  const handleLogin = useCallback(() => {
    if (returnURL) {
      localStorage.setItem("gitsquad_return_url", returnURL);
    }
    window.location.href = `${API_URL}/api/v1/auth/google`;
  }, [returnURL]);

  // Close on Escape key (modal mode only).
  useEffect(() => {
    if (mode !== "modal" || !open || !onClose) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mode, open, onClose]);

  // Prevent body scroll when modal is open.
  useEffect(() => {
    if (mode === "modal" && open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mode, open]);

  if (mode === "modal" && !open) return null;

  const content = (
    <div className="flex flex-col items-center text-center">
      {/* Logo */}
      <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
        <Image
          src="/favicon.ico"
          alt="GitSquad"
          width={48}
          height={48}
          className="size-11 rounded-xl"
          priority
        />
      </div>

      {/* Heading */}
      <h2 className="text-2xl font-bold tracking-tight text-zinc-950">
        Welcome back
      </h2>
      <p className="mt-2 text-sm text-zinc-500">
        Log in to your GitSquad account to continue
      </p>

      {/* Error */}
      {error && (
        <div className="mt-6 w-full rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600">
          {errorMessages[error] || "An unexpected error occurred. Please try again."}
        </div>
      )}

      {/* Google button */}
      <button
        onClick={handleLogin}
        className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <p className="mt-4 text-xs text-zinc-400">
        Your agent team is one click away.
      </p>
    </div>
  );

  // ── Page mode: full-page centered layout ──
  if (mode === "page") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white px-5">
        <div className="w-full max-w-sm">{content}</div>
      </main>
    );
  }

  // ── Modal mode: overlay with backdrop ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-2xl">
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="size-4" />
          </button>
        )}

        {content}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
