// The `/` menu's trigger and its command table.
//
// Same division of labour as lib/mention.ts: what the caret is asking for is
// parsed out of the text (pure, unit-testable without a DOM), and what the menu
// offers is a plain table. Icons are named rather than imported because this
// module is loaded by node:test, which cannot load a React component module.

export type SlashCommandId =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "codeBlock"
  | "quote"
  | "divider";

/**
 * The menu's sections, in the order they are shown. Sections carry no titles —
 * a hairline between them is what Linear uses, and the menu is short enough that
 * a heading per group would cost more attention than it saves.
 */
export type SlashGroup = "text" | "lists" | "blocks";

export const SLASH_GROUP_ORDER: SlashGroup[] = ["text", "lists", "blocks"];

export interface SlashCommand {
  id: SlashCommandId;
  label: string;
  /** Extra words the query can match, alongside the label. */
  aliases: string[];
  /** Icon name resolved by the editor; see the note above. */
  icon: string;
  group: SlashGroup;
}

// Ordered by group, so filtering and grouping always agree on the order: the
// keyboard walks the flattened groups top to bottom.
export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "text", label: "Text", aliases: ["paragraph", "body", "plain"], icon: "text", group: "text" },
  { id: "heading1", label: "Heading 1", aliases: ["h1", "title"], icon: "heading-1", group: "text" },
  { id: "heading2", label: "Heading 2", aliases: ["h2", "subtitle"], icon: "heading-2", group: "text" },
  { id: "heading3", label: "Heading 3", aliases: ["h3"], icon: "heading-3", group: "text" },
  { id: "bulletList", label: "Bulleted list", aliases: ["bullet", "ul", "list"], icon: "bullet-list", group: "lists" },
  { id: "orderedList", label: "Numbered list", aliases: ["numbered", "ol", "ordered", "list"], icon: "ordered-list", group: "lists" },
  { id: "codeBlock", label: "Code block", aliases: ["code", "codeblock", "fence"], icon: "code", group: "blocks" },
  { id: "quote", label: "Quote", aliases: ["blockquote", "quotation"], icon: "quote", group: "blocks" },
  { id: "divider", label: "Divider", aliases: ["hr", "rule", "separator", "line"], icon: "divider", group: "blocks" },
];

// A `/` opens the menu at the start of a block or after whitespace only — the
// same guard `@` uses, so `https://…`, `src/lib` and `and/or` are not triggers.
const SLASH_QUERY = /(?:^|\s)\/([\w-]*)$/;

/**
 * The in-progress `/query` at the end of the text before the caret, or null when
 * the caret is not inside one. `textBeforeCaret` is the document text up to the
 * caret, so a newline counts as the start of a block.
 */
export function slashQueryAt(textBeforeCaret: string): string | null {
  const match = SLASH_QUERY.exec(textBeforeCaret);
  return match ? match[1] : null;
}

/**
 * The commands an in-progress query matches. A prefix of the label (`heading`
 * reaches all three headings) or of an alias (`h1`, `hr`) matches; the empty
 * query — a bare `/` — matches everything.
 */
export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter((command) =>
    keywords(command).some((word) => word.startsWith(q)),
  );
}

export interface SlashSection {
  group: SlashGroup;
  commands: SlashCommand[];
}

/**
 * The matching commands split into the sections the menu draws, in display
 * order. A section with no matches is dropped rather than shown empty, and the
 * commands stay in their table order, so flattening the sections back gives the
 * same sequence the keyboard walks.
 */
export function groupSlashCommands(commands: SlashCommand[]): SlashSection[] {
  return SLASH_GROUP_ORDER.map((group) => ({
    group,
    commands: commands.filter((command) => command.group === group),
  })).filter((section) => section.commands.length > 0);
}

/** Label and aliases as the query sees them: lowercased, spaces removed. */
function keywords(command: SlashCommand): string[] {
  return [command.label.toLowerCase().replace(/\s+/g, ""), ...command.aliases];
}
