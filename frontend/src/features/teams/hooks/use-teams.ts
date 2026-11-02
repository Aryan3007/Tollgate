import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { unwrap, type Paginated } from "@/lib/api/client";
import { createTeam, listTeams, updateTeam, type ListTeamsParams } from "../api/teams-api";
import type { CreateTeamInput, Team, UpdateTeamInput } from "../schemas/team";

export const teamKeys = {
  all: ["teams"] as const,
  list: (params: ListTeamsParams) => ["teams", "list", params] as const,
};

export function useTeams(params: ListTeamsParams) {
  return useQuery({
    queryKey: teamKeys.list(params),
    queryFn: async ({ signal }) => unwrap(await listTeams(params, signal)),
    placeholderData: keepPreviousData,
  });
}

/** Optimistically prepends the team to the first page, then swaps in the server copy. */
export function useCreateTeam() {
  const queryClient = useQueryClient();
  const firstPage = teamKeys.list({ page: 1, limit: 20 });

  return useMutation({
    mutationFn: async (input: CreateTeamInput) =>
      unwrap(await createTeam(input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: teamKeys.all });
      const previous = queryClient.getQueryData<Paginated<Team>>(firstPage);
      if (previous) {
        const now = new Date().toISOString();
        const optimistic: Team = {
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          usage: {
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            costMicroInr: 0,
          },
          cacheTtlSeconds: 3600,
          ...input,
        };
        queryClient.setQueryData<Paginated<Team>>(firstPage, {
          ...previous,
          data: [optimistic, ...previous.data].slice(0, previous.limit),
          total: previous.total + 1,
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous)
        queryClient.setQueryData(firstPage, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

/** Applies the change to every cached page at once; rolls back if the server refuses it. */
export function useUpdateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateTeamInput }) =>
      unwrap(await updateTeam(id, input)),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: teamKeys.all });
      const snapshots = queryClient.getQueriesData<Paginated<Team>>({ queryKey: teamKeys.all });
      queryClient.setQueriesData<Paginated<Team>>(
        { queryKey: teamKeys.all },
        (page) => page && { ...page, data: page.data.map((team) => (team.id === id ? { ...team, ...input } : team)) },
      );
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      context?.snapshots.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: teamKeys.all }),
  });
}
