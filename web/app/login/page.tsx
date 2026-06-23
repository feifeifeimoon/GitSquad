"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessages: Record<string, string> = {
    invalid_state: "Session expired. Please try again.",
    token_exchange_failed: "GitHub authentication failed. Please try again.",
    github_api_failed: "Failed to fetch GitHub profile. Please try again.",
    internal_error: "An internal error occurred. Please try again later.",
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white text-zinc-950 px-5">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Welcome to GitSquad</h1>
        <p className="text-zinc-500 text-sm">
          Connect your GitHub account to get started.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600">
          {errorMessages[error] || "An unexpected error occurred. Please try again."}
        </div>
      )}

      <a
        href={`${API_URL}/api/v1/auth/github`}
        className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
      >
        <GitHubIcon />
        Login with GitHub
      </a>
    </main>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20 text-zinc-500">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
