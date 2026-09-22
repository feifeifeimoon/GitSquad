"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EditorContent,
  Extension,
  InputRule,
  useEditor,
  type Editor,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { ResolvedPos } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { Markdown as MarkdownExtension } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  SquareCode,
  Quote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mentionQueryAt } from "@/lib/mention";
import {
  markdownMarkerAt,
  markerListName,
  type MarkdownMarker,
} from "@/lib/markdown-syntax";

/** The list the caret's paragraph already sits in, when the marker repeats it. */
function repeatedListAt($from: ResolvedPos, marker: MarkdownMarker): boolean {
  const list = markerListName(marker);
  // paragraph → listItem → list, so anything shallower is not in a list.
  if (!list || $from.depth < 3) return false;
  const item = $from.node(-1);
  if (item.type.name !== "listItem" || $from.node(-2).type.name !== list) {
    return false;
  }
  // A continuation is a freshly created item; one the user has written into
  // keeps whatever follows its marker.
  return item.childCount === 1;
}

/**
 * Replace the marker the caret's paragraph opens with by the block it stands
 * for. `committed` is the text that just arrived, so a marker already sitting in
 * the paragraph — from an older paste, say — is never converted retroactively.
 */
function applyCommittedMarker(editor: Editor, committed: string): boolean {
  const committedMarker = markdownMarkerAt(committed);
  if (!committedMarker) return false;

  const { $from, empty } = editor.state.selection;
  if (!empty || $from.parent.type.name !== "paragraph") return false;
  const marker = markdownMarkerAt($from.parent.textContent);
  if (!marker || marker.block.kind !== committedMarker.block.kind) return false;
  if ($from.parentOffset < marker.length) return false;

  const from = $from.start();
  const strip = () => editor.chain().focus().deleteRange({ from, to: from + marker.length });

  // A marker that repeats the list the caret is already in is redundant — Enter
  // made the item — so the line is a sibling and only the marker goes away.
  if (repeatedListAt($from, marker)) return strip().run();

  switch (marker.block.kind) {
    case "heading":
      return strip().setHeading({ level: marker.block.level }).run();
    case "bulletList":
      return strip().toggleBulletList().run();
    case "orderedList": {
      const listStart = marker.block.start;
      const chained = strip().toggleOrderedList();
      return (listStart > 1
        ? chained.updateAttributes("orderedList", { start: listStart })
        : chained
      ).run();
    }
    case "blockquote":
      return strip().toggleBlockquote().run();
    case "codeBlock": {
      const language = marker.block.language;
      return (language ? strip().setCodeBlock({ language }) : strip().setCodeBlock()).run();
    }
  }
}

/**
 * Markdown markers the built-in input rules cannot see.
 *
 * Those rules fire while the marker and its trailing space are the last thing
 * typed, which leaves two gaps: a marker typed inside the list it repeats (the
 * rule has nothing left to wrap), and a whole line that arrives at once — an IME
 * committing `## 标题` — which never puts the paragraph into the bare `## ` state
 * the rule waits for.
 */
const MarkdownMarkers = Extension.create({
  name: "markdownMarkers",

  addInputRules() {
    return [
      new InputRule({
        find: /^([-*+]|\d{1,9}\.)[ \t]$/,
        handler: ({ state, range, match, chain }) => {
          const marker = markdownMarkerAt(match[0]);
          if (!marker || !repeatedListAt(state.selection.$from, marker)) {
            return null;
          }
          chain().deleteRange({ from: range.from, to: range.to }).run();
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            compositionend: (_view, event) => {
              const committed = (event as CompositionEvent).data ?? "";
              // A tick later, so ProseMirror is out of composition mode before a
              // command runs — the same deferral the input rules plugin uses.
              setTimeout(() => applyCommittedMarker(this.editor, committed), 0);
              return false;
            },
          },
        },
      }),
    ];
  },
});

function BubbleButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-sm p-1.5 text-body transition-colors hover:bg-muted hover:text-ink",
        active && "bg-muted text-ink",
      )}
    >
      {children}
    </button>
  );
}

function BubbleDivider() {
  return <span className="mx-0.5 h-4 w-px bg-hairline" />;
}

interface MentionState {
  query: string;
  from: number;
  to: number;
  x: number;
  y: number;
}

export function MarkdownEditor({
  content,
  onChange,
  onSubmit,
  autoFocus = false,
  ariaLabel,
  placeholder,
  className,
  mentionItems = [],
}: {
  /**
   * The markdown to open with, parsed by the editor's own markdown extension.
   *
   * It seeds the editor once, at mount: an editor that re-seeded itself on
   * every change would fight whoever is typing into it. A caller that loads
   * different content into the same instance passes a `key`.
   */
  content?: string;
  onChange?: (md: string) => void;
  /**
   * Sent on `⌘↵` / `Ctrl↵`, for a caller that has something to send.
   *
   * `↵` on its own has to stay a newline — this is a markdown box — so the
   * chord is the send gesture, the way it is in Linear and in multica's
   * composer.
   */
  onSubmit?: () => void;
  /**
   * Put the caret in the editor as it mounts. For a caller that clears its
   * editor by remounting, so the box it just sent from is still where the next
   * one gets typed.
   */
  autoFocus?: boolean;
  /**
   * The editor's accessible name.
   *
   * A page can hold two of these — an issue's description and its comment box —
   * and a pair of nameless text boxes is as indistinguishable to a screen
   * reader as it is to a test.
   */
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  mentionItems?: string[];
}) {
  const [mention, setMention] = useState<MentionState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Refs so the ProseMirror keydown handler (created once) always sees the
  // latest suggestion state without recreating the editor.
  const editorRef = useRef<Editor | null>(null);
  const mentionRef = useRef<MentionState | null>(null);
  const filteredRef = useRef<string[]>([]);
  const selectedIndexRef = useRef(0);
  const onSubmitRef = useRef(onSubmit);

  // Detect an active `@query` immediately before the caret and surface the
  // suggestion popup. Suppressed inside code (blocks and inline).
  const computeMention = useCallback((editor: Editor) => {
    const { from, empty } = editor.state.selection;
    if (!empty || editor.isActive("codeBlock") || editor.isActive("code")) {
      setMention(null);
      return;
    }
    const before = editor.state.doc.textBetween(0, from, "\n", " ");
    const query = mentionQueryAt(before);
    if (query === null) {
      setMention(null);
      return;
    }
    const atPos = from - query.length - 1;
    const coords = editor.view.coordsAtPos(atPos);
    setMention({ query, from: atPos, to: from, x: coords.left, y: coords.bottom });
    setSelectedIndex(0);
  }, []);

  const selectMention = useCallback((name: string) => {
    const editor = editorRef.current;
    const m = mentionRef.current;
    if (!editor || !m) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: m.from, to: m.to })
      .insertContent("@" + name + " ")
      .run();
    setMention(null);
  }, []);

  const editor = useEditor({
    // `contentType: "markdown"` is what lets this start from stored markdown
    // rather than ProseMirror JSON, which is the shape the API speaks.
    content: content ?? "",
    contentType: "markdown",
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit,
      MarkdownExtension,
      Placeholder.configure({ placeholder: placeholder ?? "Write markdown…" }),
      MarkdownMarkers,
    ],
    onUpdate: ({ editor }) => {
      onChange?.(editor.getMarkdown());
      computeMention(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      computeMention(editor);
    },
    editorProps: {
      // The editable element is the one carrying `role="textbox"`, so the name
      // has to land here rather than on the caller's wrapper — and `attributes`
      // *replaces* the editor's defaults rather than merging with them, so the
      // role has to be restated alongside it.
      attributes: ariaLabel
        ? { role: "textbox", "aria-label": ariaLabel }
        : {},
      handleKeyDown: (_view, event) => {
        // Handled here rather than by the keymap below: the hard-break
        // extension claims `Mod-Enter` for itself, so a submit shortcut left to
        // the extensions would insert a break and send.
        if (
          onSubmitRef.current &&
          (event.metaKey || event.ctrlKey) &&
          event.key === "Enter"
        ) {
          event.preventDefault();
          onSubmitRef.current();
          return true;
        }
        if (!mentionRef.current) return false;
        const items = filteredRef.current;
        if (event.key === "Escape") {
          setMention(null);
          return true;
        }
        if (items.length === 0) return false;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          selectMention(items[selectedIndexRef.current]);
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const filtered = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return mentionItems.filter((n) => n.toLowerCase().includes(q));
  }, [mention, mentionItems]);

  useEffect(() => {
    mentionRef.current = mention;
    selectedIndexRef.current = selectedIndex;
    filteredRef.current = filtered;
  }, [mention, selectedIndex, filtered]);

  // The keydown handler is created once, so a caller's inline send callback
  // would otherwise be the one captured on the first render.
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  if (!editor) {
    return <div className={className} />;
  }

  return (
    // The caller's className lands on EditorContent, so the wrapper has to carry
    // the flex sizing: in the create dialog it is the child that fills the
    // dialog, and the editor scrolls inside it.
    <div className="relative flex min-h-0 flex-1 flex-col">
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-md border border-hairline bg-canvas p-1 shadow-level-4"
      >
        <BubbleButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold className="size-4" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic className="size-4" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="size-4" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline code"
        >
          <Code className="size-4" />
        </BubbleButton>
        <BubbleDivider />
        <BubbleButton
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          <Heading1 className="size-4" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <Heading2 className="size-4" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          <Heading3 className="size-4" />
        </BubbleButton>
        <BubbleDivider />
        <BubbleButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <List className="size-4" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered list"
        >
          <ListOrdered className="size-4" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code block"
        >
          <SquareCode className="size-4" />
        </BubbleButton>
        <BubbleButton
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Quote"
        >
          <Quote className="size-4" />
        </BubbleButton>
      </BubbleMenu>
      <EditorContent editor={editor} className={cn("tiptap-content", className)} />

      {mention && filtered.length > 0 && (
        <div
          className="fixed z-50 max-h-56 w-56 overflow-y-auto rounded-md border border-hairline bg-canvas py-1 shadow-level-4"
          style={{ left: mention.x, top: mention.y }}
        >
          {filtered.map((name, i) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectMention(name);
              }}
              className={cn(
                "flex w-full items-center px-3 py-1.5 text-left text-copy transition-colors",
                i === selectedIndex
                  ? "bg-muted text-ink"
                  : "text-body hover:bg-muted/50",
              )}
            >
              @{name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
