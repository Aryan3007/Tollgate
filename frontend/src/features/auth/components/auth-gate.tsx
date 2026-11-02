"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessionBootstrap } from "../hooks/use-auth";

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

/** Redirects to /login when there is no valid session. The API enforces auth; this only avoids showing pages that cannot load. */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useSessionBootstrap();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  return status === "authenticated" ? children : <PageSkeleton />;
}
