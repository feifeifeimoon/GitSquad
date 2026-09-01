import { cn } from "@/lib/utils";

// Workspace avatar: shows the uploaded image when set, otherwise the
// GitSquad logo. Uses a plain <img> because the avatar may be a data URL
// (not optimizable by next/image).
export function WorkspaceAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string;
  className?: string;
}) {
  const src = avatarUrl || "/favicon.ico";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className={cn("shrink-0 rounded-sm object-cover", className)}
    />
  );
}
