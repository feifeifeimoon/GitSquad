"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return !!localStorage.getItem("gitsquad_token");
  });

  useEffect(() => {
    const token = localStorage.getItem("gitsquad_token");
    if (!token) return;

    api
      .get<User>("/api/v1/me")
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("gitsquad_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("gitsquad_token");
    setUser(null);
  }, []);

  return { user, loading, logout, isAuthenticated: !!user };
}
