import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  label: string;
  icon: LucideIcon;
  value?: ReactNode;
  hint?: ReactNode;
  loading?: boolean;
}

export function StatCard({
  label,
  icon: Icon,
  value,
  hint,
  loading,
}: StatCardProps) {
  return (
    <div className="flex items-center gap-5 rounded-xl border bg-card px-5 py-6 sm:px-6">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full border">
        <Icon className="size-5 text-foreground/80" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-32" />
        ) : (
          <p className="mt-1 truncate font-mono text-2xl font-semibold tabular-nums tracking-tight">
            {value}
          </p>
        )}
        {hint && !loading && (
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}
