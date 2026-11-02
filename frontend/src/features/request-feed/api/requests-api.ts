import { apiRequest, paginatedSchema } from "@/lib/api/client";
import { requestLogSchema } from "../schemas/request-log";

export interface ListRequestsParams {
  page: number;
  limit: number;
  keyId?: string;
  teamId?: string;
  outcome?: "success" | "error";
}

export function listRequests(params: ListRequestsParams, signal?: AbortSignal) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.keyId) query.set("keyId", params.keyId);
  if (params.teamId) query.set("teamId", params.teamId);
  if (params.outcome) query.set("outcome", params.outcome);
  return apiRequest(`/v1/admin/requests?${query}`, {
    schema: paginatedSchema(requestLogSchema),
    signal,
  });
}
