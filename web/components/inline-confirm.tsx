"use client";

import { Trash2 } from "lucide-react";

/**
 * The two-step confirm behind a destructive row icon.
 *
 * Inline rather than a dialog: the row is already on screen, so a modal would
 * cost a dismissal to ask about something the user is looking at. The label is
 * spelled out rather than left to the icon, and the question is the caller's
 * word for the action — deleting an agent and removing a daemon read
 * differently even though the mechanics are the same.
 */
export function InlineConfirm({
  confirming,
  question,
  title,
  onRequest,
  onConfirm,
  onCancel,
}: {
  confirming: boolean;
  question: string;
  title: string;
  onRequest: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (confirming) {
    return (
      <span className="flex items-center gap-2 whitespace-nowrap text-caption">
        <span className="text-destructive">{question}</span>
        <button
          onClick={onConfirm}
          className="font-medium text-destructive hover:underline"
        >
          Yes
        </button>
        <button onClick={onCancel} className="text-mute hover:text-body">
          No
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={onRequest}
      title={title}
      aria-label={title}
      className="text-hairline-strong transition-colors hover:text-destructive"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
