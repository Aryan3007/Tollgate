import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { unwrap } from "@/lib/api/client";
import { listRequests, type ListRequestsParams } from "../api/requests-api";

export const requestKeys = {
  all: ["requests"] as const,
  list: (params: ListRequestsParams) => ["requests", "list", params] as const,
};

/** Polls while mounted so new traffic shows up without a reload. */
export function useRequests(
  params: ListRequestsParams,
  { pollMs }: { pollMs?: number } = {},
) {
  return useQuery({
    queryKey: requestKeys.list(params),
    queryFn: async ({ signal }) => unwrap(await listRequests(params, signal)),
    placeholderData: keepPreviousData,
    refetchInterval: pollMs,
  });
}
