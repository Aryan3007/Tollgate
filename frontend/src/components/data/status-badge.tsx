import { cn } from "@/lib/utils";

export type BadgeTone = "success" | "warning" | "danger" | "neutral";

const toneClass: Record<BadgeTone, string> = {
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-danger text-danger-foreground",
  neutral: "bg-neutral text-neutral-foreground",
};

export function StatusBadge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium",
        toneClass[tone],
      )}
    >
      <span className="size-2 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}
