"use client";

import { useEffect } from "react";

export default function CallbackPage() {
  useEffect(() => {
    // Token is passed in the URL hash fragment: #<token>
    const hash = window.location.hash.slice(1); // remove leading #
    if (hash) {
      const token = decodeURIComponent(hash);
      localStorage.setItem("gitsquad_token", token);
    }
    const returnURL = localStorage.getItem("gitsquad_return_url");
    localStorage.removeItem("gitsquad_return_url");
    window.location.href = returnURL || "/";
  }, []);

  return null;
}
