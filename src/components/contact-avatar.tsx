import { cn } from "@/lib/utils";

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

const sizeClasses: Record<string, string> = {
  sm: "size-7 text-[10px]",
  md: "size-10 text-xs",
  lg: "size-12 text-sm",
};

export function ContactAvatar({
  name,
  avatarUrl,
  size = "md",
  className,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const base = cn("shrink-0 rounded-full object-cover", sizeClasses[size], className);

  if (avatarUrl) {
    return <img src={avatarUrl} alt={`Foto de ${name ?? "contato"}`} loading="lazy" className={base} />;
  }

  return (
    <span
      className={cn(
        base,
        "flex items-center justify-center bg-muted font-medium text-muted-foreground",
      )}
    >
      {initials(name)}
    </span>
  );
}
