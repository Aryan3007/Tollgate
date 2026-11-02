import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { unwrap, type Paginated } from "@/lib/api/client";
import {
  createKey,
  listKeys,
  listModels,
  revokeKey,
  type CreateKeyInput,
  type ListKeysParams,
} from "../api/keys-api";
import type { VirtualKey } from "../schemas/key";

export const keyKeys = {
  all: ["keys"] as const,
  list: (params: ListKeysParams) => ["keys", "list", params] as const,
  models: ["models"] as const,
};

export function useKeys(params: ListKeysParams, { pollMs }: { pollMs?: number } = {}) {
  return useQuery({
    queryKey: keyKeys.list(params),
    queryFn: async ({ signal }) => unwrap(await listKeys(params, signal)),
    placeholderData: keepPreviousData,
    refetchInterval: pollMs,
  });
}

export function useModels() {
  return useQuery({
    queryKey: keyKeys.models,
    queryFn: async ({ signal }) => unwrap(await listModels(signal)),
    staleTime: 5 * 60_000,
  });
}

/**
 * Not optimistic: the secret only exists in the server's response, and the
 * drawer must show it before anything else happens.
 */
export function useCreateKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateKeyInput) => unwrap(await createKey(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyKeys.all }),
  });
}

/** Marks the key revoked in every cached page immediately; rolls back if the server refuses. */
export function useRevokeKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await revokeKey(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: keyKeys.all });
      const snapshots = queryClient.getQueriesData<Paginated<VirtualKey>>({
        queryKey: keyKeys.all,
      });
      const revokedAt = new Date().toISOString();
      queryClient.setQueriesData<Paginated<VirtualKey>>(
        { queryKey: keyKeys.all },
        (page) =>
          page && {
            ...page,
            data: page.data.map((key) =>
              key.id === id ? { ...key, status: "revoked", revokedAt } : key,
            ),
          },
      );
      return { snapshots };
    },
    onError: (_error, _id, context) => {
      context?.snapshots.forEach(([queryKey, data]) =>
        queryClient.setQueryData(queryKey, data),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keyKeys.all }),
  });
}
