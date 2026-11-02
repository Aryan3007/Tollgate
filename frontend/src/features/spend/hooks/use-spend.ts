import { useQuery } from "@tanstack/react-query";
import { unwrap } from "@/lib/api/client";
import { getSpendReport } from "../api/spend-api";

export function useSpendReport() {
  return useQuery({
    queryKey: ["spend", "report"],
    queryFn: async ({ signal }) => unwrap(await getSpendReport(signal)),
    refetchInterval: 15_000,
  });
}
