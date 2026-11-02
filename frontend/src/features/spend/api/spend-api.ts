import { apiRequest } from "@/lib/api/client";
import { spendReportSchema } from "../schemas/spend";

export function getSpendReport(signal?: AbortSignal) {
  return apiRequest("/v1/admin/analytics/spend", {
    schema: spendReportSchema,
    signal,
  });
}
