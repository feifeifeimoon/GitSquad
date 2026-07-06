"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ConsoleHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/console/workspaces");
  }, [router]);
  return null;
}
