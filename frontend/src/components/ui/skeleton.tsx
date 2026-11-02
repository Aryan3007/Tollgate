import { Skeleton as PrimeSkeleton } from "primereact/skeleton";
import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  shape?: "rectangle" | "circle";
}

/**
 * PrimeReact's Skeleton with no theme loaded. Empty width/height stop it from
 * writing inline sizes, so Tailwind classes control the size instead.
 */
export function Skeleton({ className, shape = "rectangle" }: SkeletonProps) {
  return (
    <PrimeSkeleton
      shape={shape}
      animation="none"
      width=""
      height=""
      className={cn(
        "bg-muted",
        shape === "circle" ? "rounded-full" : "rounded-md",
        className,
      )}
    />
  );
}
