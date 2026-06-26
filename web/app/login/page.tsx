"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LoginModal } from "@/components/login-modal";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const returnURL = searchParams.get("return") || undefined;

  return (
    <LoginModal
      mode="page"
      error={error}
      returnURL={returnURL}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20 text-zinc-500">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
