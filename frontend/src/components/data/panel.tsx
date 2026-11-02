import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
  /** Drop body padding so tables can run edge to edge. */
  flush?: boolean;
  children: ReactNode;
}

/** Bordered card with a titled header, used for charts and tables. */
export function Panel({
  title,
  icon: Icon,
  actions,
  className,
  flush,
  children,
}: PanelProps) {
  return (
    <section
      className={cn("rounded-xl border bg-card", className)}
      aria-label={title}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="flex size-9 items-center justify-center rounded-lg border">
              <Icon className="size-[18px] text-muted-foreground" aria-hidden />
            </span>
          )}
          <h2 className="text-lg font-medium">{title}</h2>
        </div>
        {actions}
      </header>
      <div className={flush ? undefined : "p-4 sm:p-6"}>{children}</div>
    </section>
  );
}
