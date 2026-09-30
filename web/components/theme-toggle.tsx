"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

// The icon pair is swapped by the `dark:` variant rather than by reading the
// theme in JavaScript: `resolvedTheme` is unknown on the server, so a render that
// depended on it would disagree with the markup it is hydrating.
//
// `className` is for callers that need it to sit in their own row of controls —
// the console passes nothing, the marketing nav shapes it like the links beside
// it.
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className={cn("text-mute transition-colors hover:text-ink", className)}
      title="Toggle theme"
      aria-label="Toggle theme"
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </button>
  )
}
