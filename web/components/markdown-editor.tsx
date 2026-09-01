"use client";

import { useEditor, EditorContent } from "@tiptap/react";
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

export function MarkdownEditor({
  onChange,
  placeholder,
  className,
}: {
  onChange?: (md: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      MarkdownExtension,
      Placeholder.configure({ placeholder: placeholder ?? "Write markdown…" }),
    ],
    onUpdate: ({ editor }) => {
      onChange?.(editor.getMarkdown());
    },
  });

  if (!editor) {
    return <div className={className} />;
  }

  return (
    <>
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
    </>
  );
}
