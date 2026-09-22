import { cn } from "@/lib/utils";

// The grammar of a settings page: a section is a heading plus one card, and a
// setting is a row inside it.
//
// The pages used to give every *setting* its own bordered card, with the label
// stacked above the value — five sections meant five cards, eight gaps and a
// page you had to scroll, for about four facts. Every reference does the
// opposite: one card per section, and inside it rows with the label on the left
// and the control on the right. orca calls it the "two-column row grammar" and
// multica splits its rows with `divide-y`; the effect in both is that a settings
// page is scannable in one pass instead of four screens of stacked pairs.

/** One section: a heading, and one card holding its rows. */
export function SettingSection({
  title,
  description,
  tone = "default",
  children,
}: {
  title: string;
  description?: string;
  /** Reserved for the section that cannot be undone. */
  tone?: "default" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2
        className={cn(
          "text-label font-semibold",
          tone === "destructive" ? "text-destructive" : "text-ink",
        )}
      >
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-caption leading-5 text-mute">{description}</p>
      )}
      <div className="mt-3 divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-canvas shadow-level-2">
        {children}
      </div>
    </section>
  );
}

/**
 * One setting: what it is on the left, how to change it on the right.
 *
 * `leading` is for the rows whose value *is* a picture — an avatar reads as part
 * of the label, not as a control on the right.
 *
 * `align` exists because a row whose control is a button wants its label centred
 * against it, while a row whose description runs to two lines wants the control
 * pinned to the top.
 */
export function SettingRow({
  leading,
  label,
  description,
  align = "center",
  className,
  children,
}: {
  leading?: React.ReactNode;
  label: React.ReactNode;
  description?: React.ReactNode;
  align?: "center" | "top";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-4 px-5 py-3.5",
        align === "center" ? "sm:items-center" : "sm:items-start",
        children && "sm:justify-between",
        className,
      )}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-copy font-medium text-ink">{label}</div>
        {description && (
          <div className="mt-0.5 text-caption leading-5 text-mute">
            {description}
          </div>
        )}
      </div>
      {children && (
        <div
          className={cn(
            "shrink-0",
            align === "center" ? "self-center" : "self-start",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
