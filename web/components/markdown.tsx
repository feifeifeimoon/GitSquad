import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

// Both plugin lists and the component map are module constants: react-markdown
// re-runs the whole unified pipeline on every render, and a fresh array on each
// pass would defeat the memo below even when the text has not changed.
const REMARK_PLUGINS = [remarkGfm, remarkBreaks];
const REHYPE_PLUGINS = [rehypeHighlight];

// Minimal markdown renderer tuned to the Vercel design language. Mirrors
// Multica's ReadonlyContent: react-markdown + GFM + line breaks + lowlight
// code highlighting, without the mention/attachment/math machinery.
const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-lg font-semibold text-ink">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 text-base font-semibold text-ink">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-copy font-semibold text-ink">{children}</h3>
  ),
  p: ({ children }) => <p className="my-1 text-copy text-body">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-1 list-disc pl-5 text-copy text-body">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1 list-decimal pl-5 text-copy text-body">{children}</ol>
  ),
  li: ({ children }) => <li className="my-0.5">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-link underline underline-offset-2"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-hairline-strong pl-3 text-body">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = /hljs|language-/.test(className || "");
    return (
      <code
        className={cn(
          "font-mono text-caption",
          !isBlock && "rounded bg-muted px-1 py-0.5",
          className,
        )}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-canvas-soft-2 p-3 font-mono text-caption text-ink">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-copy">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-hairline bg-canvas-soft px-3 py-1.5 text-left font-medium text-ink">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-hairline px-3 py-1.5 text-body">{children}</td>
  ),
  hr: () => <hr className="my-3 border-hairline" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  input: ({ type, checked }) => {
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mr-1.5 align-middle"
        />
      );
    }
    return <input type={type} checked={checked} readOnly />;
  },
};

/**
 * Markdown is memoized on its source text: an issue page renders one of these
 * per comment, and the parse plus syntax-highlight pass is the expensive part
 * of a comment feed that re-renders while someone types in the composer below.
 */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={COMPONENTS}
    >
      {children}
    </ReactMarkdown>
  );
});
