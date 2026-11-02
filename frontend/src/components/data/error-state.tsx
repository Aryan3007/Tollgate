import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/client";

export function ErrorState({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center px-4 py-14 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-danger">
        <AlertTriangle className="size-5 text-danger-foreground" aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-medium">Couldn&apos;t load this</h3>
      <p className="mt-1 max-w-md text-[15px] text-muted-foreground">
        {error.message}
      </p>
      {onRetry && (
        <Button variant="outline" size="lg" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
