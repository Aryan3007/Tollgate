import { z } from "zod";
import { apiRequest } from "@/lib/api/client";
import { sessionSchema, type LoginInput } from "../schemas/session";

export function login(input: LoginInput) {
  return apiRequest("/v1/admin/auth/login", {
    method: "POST",
    body: input,
    schema: sessionSchema,
    auth: false,
  });
}

export function logout() {
  return apiRequest("/v1/admin/auth/logout", {
    method: "POST",
    schema: z.undefined(),
    auth: false,
  });
}
