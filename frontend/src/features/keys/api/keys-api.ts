import { apiRequest, paginatedSchema } from "@/lib/api/client";
import {
  catalogModelSchema,
  createdKeySchema,
  keySchema,
  type KeyStatus,
} from "../schemas/key";

export interface ListKeysParams {
  page: number;
  limit: number;
  status?: KeyStatus;
}

export interface CreateKeyInput {
  teamId: string;
  name: string;
  allowedModels: string[];
  rpmLimit?: number;
  tpmLimit?: number;
  expiresAt?: string;
}

export function listKeys(params: ListKeysParams, signal?: AbortSignal) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.status) query.set("status", params.status);
  return apiRequest(`/v1/admin/keys?${query}`, {
    schema: paginatedSchema(keySchema),
    signal,
  });
}

export function createKey(input: CreateKeyInput) {
  return apiRequest("/v1/admin/keys", {
    method: "POST",
    body: input,
    schema: createdKeySchema,
  });
}

export function revokeKey(id: string) {
  return apiRequest(`/v1/admin/keys/${id}/revoke`, {
    method: "POST",
    schema: keySchema,
  });
}

export function listModels(signal?: AbortSignal) {
  return apiRequest("/v1/admin/models?limit=100", {
    schema: paginatedSchema(catalogModelSchema),
    signal,
  });
}
