"use client";

import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { LoginModal } from "@/components/login-modal";

// The page's call to action, wherever it appears. Its own modal rather than one
// lifted into a provider: `LoginModal` renders null while closed, so a second
// instance costs nothing until somebody clicks, and the hero stays a server
// component with a single client leaf in it.
export function GetStartedCta({
  children,
  size = "pill",
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  size?: ComponentProps<typeof Button>["size"];
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <LoginModal mode="modal" open={open} onClose={() => setOpen(false)} />
    </>
  );
}
