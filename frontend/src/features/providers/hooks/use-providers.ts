import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest, unwrap } from "@/lib/api/client";
import { providerHealthSchema } from "../schemas/provider";

export function useProviderHealth() {
  return useQuery({
    queryKey: ["providers", "health"],
    queryFn: async ({ signal }) =>
      unwrap(
        await apiRequest("/v1/admin/providers", {
          schema: z.array(providerHealthSchema),
          signal,
        }),
      ),
    refetchInterval: 5_000,
  });
}
