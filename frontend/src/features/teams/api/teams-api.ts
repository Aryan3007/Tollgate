import { apiRequest, paginatedSchema } from "@/lib/api/client";
import { teamSchema, type CreateTeamInput, type UpdateTeamInput } from "../schemas/team";

export interface ListTeamsParams {
  page: number;
  limit: number;
  sortBy?: "createdAt" | "name";
  sortOrder?: "asc" | "desc";
}

export function listTeams(params: ListTeamsParams, signal?: AbortSignal) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    sortBy: params.sortBy ?? "createdAt",
    sortOrder: params.sortOrder ?? "desc",
  });
  return apiRequest(`/v1/admin/teams?${query}`, {
    schema: paginatedSchema(teamSchema),
    signal,
  });
}

export function createTeam(input: CreateTeamInput) {
  return apiRequest("/v1/admin/teams", {
    method: "POST",
    body: input,
    schema: teamSchema,
  });
}

export function updateTeam(id: string, input: UpdateTeamInput) {
  return apiRequest(`/v1/admin/teams/${id}`, {
    method: "PATCH",
    body: input,
    schema: teamSchema,
  });
}
