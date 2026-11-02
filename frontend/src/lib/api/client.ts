import { z } from "zod";
import { sessionSchema } from "@/features/auth/schemas/session";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { env } from "@/lib/env";

export interface ApiError {
  /** 0 when the request never reached the server. */
  status: number;
  code: string;
  message: string;
  /** Request field the error refers to, when the server names one. */
  param?: string | null;
}

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: ApiError };

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions<T> {
  schema: z.ZodType<T>;
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
  /** Attach the admin access token and refresh it on 401. Defaults to true. */
  auth?: boolean;
}

const errorBodySchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    param: z.string().nullable().optional(),
  }),
});

const NETWORK_ERROR: ApiError = {
  status: 0,
  code: "network_error",
  message: "Could not reach the Tollgate API",
};

let refreshing: Promise<boolean> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Concurrent
 * callers share one request: the server rotates the refresh token on every
 * use and treats reuse as theft, so parallel refreshes would log the user out.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const { setSession, clear } = useAuthStore.getState();
    try {
      const res = await fetch(
        `${env.NEXT_PUBLIC_API_URL}/v1/admin/auth/refresh`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const parsed = sessionSchema.safeParse(
        res.ok ? await res.json() : undefined,
      );
      if (!parsed.success) {
        clear();
        return false;
      }
      setSession(parsed.data);
      return true;
    } catch {
      clear();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function send(path: string, init: RequestInit, auth: boolean) {
  const token = auth ? useAuthStore.getState().accessToken : null;
  return fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function apiRequest<T>(
  path: string,
  { schema, method = "GET", body, signal, auth = true }: RequestOptions<T>,
): Promise<ApiResult<T>> {
  const init: RequestInit = {
    method,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  };

  let res: Response;
  try {
    res = await send(path, init, auth);
    if (res.status === 401 && auth && (await refreshSession())) {
      res = await send(path, init, auth);
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ok: false, error: NETWORK_ERROR };
  }

  const json: unknown =
    res.status === 204 ? undefined : await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = errorBodySchema.safeParse(json);
    return {
      ok: false,
      error: {
        status: res.status,
        code: parsed.data?.error.code ?? `http_${res.status}`,
        message: parsed.data?.error.message ?? res.statusText,
        param: parsed.data?.error.param ?? null,
      },
    };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        status: res.status,
        code: "invalid_response",
        message: "Unexpected response from the Tollgate API",
      },
    };
  }
  return { ok: true, data: parsed.data };
}

export class ApiRequestError extends Error {
  constructor(readonly error: ApiError) {
    super(error.message);
    this.name = "ApiRequestError";
  }
}

/**
 * TanStack Query only enters its error state when the query or mutation
 * function throws, so those functions unwrap results here. Everywhere else,
 * use the result union.
 */
export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new ApiRequestError(result.error);
  return result.data;
}

export function apiErrorOf(error: unknown): ApiError {
  return error instanceof ApiRequestError
    ? error.error
    : { status: 0, code: "unknown", message: "Something went wrong" };
}

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
  });
}
export type Paginated<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
};
