"use client"

import { Toaster as Sonner } from "sonner"

function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      richColors
    />
  )
}

export { Toaster }
