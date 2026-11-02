import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-medium">{title}</h3>
      <p className="mt-1 max-w-md text-[15px] text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
