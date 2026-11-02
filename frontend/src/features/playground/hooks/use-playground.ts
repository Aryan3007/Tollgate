import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiRequestError } from "@/lib/api/client";
import { listAllowedModels } from "../api/gateway-client";
import type { Scenario } from "../presets";
import { runScenario, sendOne } from "../run-query";
import { virtualKeySchema } from "../schemas/playground";

/** The models this virtual key may call. Also proves the key works. */
export function useAllowedModels(key: string) {
  const valid = virtualKeySchema.safeParse(key).success;
  return useQuery({
    queryKey: ["playground", "models", key.trim()],
    enabled: valid,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const result = await listAllowedModels(key.trim(), signal);
      if (!result.ok) throw new ApiRequestError(result.error);
      return result.data;
    },
  });
}

/** Runs are client-initiated, so they go through mutations like any other server call. */
export function usePlaygroundRuns() {
  const send = useMutation({
    mutationFn: ({ prompt, model }: { prompt: string; model: string }) =>
      sendOne(prompt, model),
  });
  const scenario = useMutation({
    mutationFn: ({ scenario, model }: { scenario: Scenario; model: string }) =>
      runScenario(scenario, model),
  });
  return {
    send: (prompt: string, model: string) => send.mutate({ prompt, model }),
    runScenario: (scenarioToRun: Scenario, model: string) =>
      scenario.mutate({ scenario: scenarioToRun, model }),
  };
}
