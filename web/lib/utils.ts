import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Our type scale is named by role (`text-label`, `text-copy`, `text-title`…),
// and tailwind-merge does not know those names: it reads any unknown
// `text-*` as a colour, so `cn("text-label", "text-ink")` dropped the size and
// left the heading at the inherited 16px. Registering the roles as font sizes
// keeps them beside a text colour instead of losing to it.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: ["micro", "caption", "label", "copy", "title-sm", "title", "display"],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

