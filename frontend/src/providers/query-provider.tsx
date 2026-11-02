"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";
import { ApiRequestError } from "@/lib/api/client";

const MAX_RETRIES = 2;

function shouldRetry(failureCount: number, error: unknown): boolean {
  // 4xx responses will not change on retry.
  const isClientError =
    error instanceof ApiRequestError &&
    error.error.status >= 400 &&
    error.error.status < 500;
  return !isClientError && failureCount < MAX_RETRIES;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: shouldRetry },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
