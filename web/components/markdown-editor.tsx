"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
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
  onChange,
  placeholder,
  className,
  mentionItems = [],
}: {
  onChange?: (md: string) => void;
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

  // Detect an active `@query` immediately before the caret and surface the
  // suggestion popup. Suppressed inside code (blocks and inline).
  const computeMention = useCallback((editor: Editor) => {
    const { from, empty } = editor.state.selection;
    if (!empty || editor.isActive("codeBlock") || editor.isActive("code")) {
      setMention(null);
      return;
    }
    const before = editor.state.doc.textBetween(0, from, "\n", " ");
    const m = /(?:^|\s)@([\w-]*)$/.exec(before);
    if (!m) {
      setMention(null);
      return;
    }
    const query = m[1];
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
    extensions: [
      StarterKit,
      MarkdownExtension,
      Placeholder.configure({ placeholder: placeholder ?? "Write markdown…" }),
    ],
    onUpdate: ({ editor }) => {
      onChange?.(editor.getMarkdown());
      computeMention(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      computeMention(editor);
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
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

  if (!editor) {
    return <div className={className} />;
  }

  return (
    <div className="relative">
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
                "flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors",
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
