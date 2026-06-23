"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      localStorage.setItem("gitsquad_token", token);
      router.push("/");
    } else {
      setError("No token received from authentication server.");
    }
  }, [searchParams, router]);

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white text-zinc-950 gap-4 px-5">
        <p className="text-red-600">{error}</p>
        <a href="/login" className="text-zinc-500 hover:text-zinc-950 text-sm transition-colors">
          Back to login
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white text-zinc-950 gap-4 px-5">
      <div className="animate-spin w-6 h-6 border-2 border-zinc-950 border-t-transparent rounded-full" />
      <p className="text-zinc-500 text-sm">Completing login...</p>
    </main>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20 text-zinc-500">Loading...</div>}>
      <CallbackContent />
    </Suspense>
  );
}
