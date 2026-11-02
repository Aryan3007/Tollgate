import { env } from "@/lib/env";
import {
  callStatsSchema,
  completionSchema,
  errorBodySchema,
  modelListSchema,
  streamChunkSchema,
  type CallStats,
} from "../schemas/playground";

// The playground talks to the gateway the way an app does: with a virtual key,
// not the admin session, so what it shows is exactly what an app would see.

export interface GatewayError {
  /** 0 when the request never completed. */
  status: number;
  code: string;
  message: string;
}
export type GatewayResult<T> =
  { ok: true; data: T } | { ok: false; error: GatewayError };

const NETWORK_ERROR: GatewayError = {
  status: 0,
  code: "network_error",
  message: "Could not reach the Tollgate gateway",
};
const CANCELLED: GatewayError = {
  status: 0,
  code: "cancelled",
  message: "Stopped",
};
const BAD_RESPONSE: GatewayError = {
  status: 0,
  code: "invalid_response",
  message: "Unexpected response from the gateway",
};

const headersFor = (key: string) => ({
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
  // Opt in to the cost and savings report for each request.
  "x-tollgate-stats": "1",
});

async function errorOf(res: Response): Promise<GatewayError> {
  const parsed = errorBodySchema.safeParse(
    await res.json().catch(() => undefined),
  );
  return {
    status: res.status,
    code: parsed.data?.error.code ?? `http_${res.status}`,
    message: parsed.data?.error.message ?? res.statusText,
  };
}

function parseStats(text: string | null): CallStats | null {
  if (!text) return null;
  try {
    const parsed = callStatsSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listAllowedModels(
  key: string,
  signal?: AbortSignal,
): Promise<GatewayResult<string[]>> {
  let res: Response;
  try {
    res = await fetch(`${env.NEXT_PUBLIC_API_URL}/v1/models`, {
      headers: headersFor(key),
      signal,
    });
  } catch {
    if (signal?.aborted) return { ok: false, error: CANCELLED };
    return { ok: false, error: NETWORK_ERROR };
  }
  if (!res.ok) return { ok: false, error: await errorOf(res) };

  const parsed = modelListSchema.safeParse(
    await res.json().catch(() => undefined),
  );
  return parsed.success
    ? { ok: true, data: parsed.data.data.map((model) => model.id) }
    : { ok: false, error: BAD_RESPONSE };
}

export interface ChatInput {
  key: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  /** Omitted from the request when undefined, so the provider default applies. */
  temperature?: number;
  maxTokens: number;
  stream: boolean;
}

export interface ChatOutcome {
  reply: string;
  stats: CallStats | null;
}

/**
 * Sends one chat request. `onText` receives the whole reply so far each time
 * it grows (once for a non-streaming call, many times for a stream).
 */
export async function sendChat(
  input: ChatInput,
  onText: (reply: string) => void,
  signal: AbortSignal,
): Promise<GatewayResult<ChatOutcome>> {
  let res: Response;
  try {
    res = await fetch(`${env.NEXT_PUBLIC_API_URL}/v1/chat/completions`, {
      method: "POST",
      headers: headersFor(input.key),
      signal,
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        max_tokens: input.maxTokens,
        stream: input.stream,
        ...(input.temperature === undefined
          ? {}
          : { temperature: input.temperature }),
      }),
    });
  } catch {
    return { ok: false, error: signal.aborted ? CANCELLED : NETWORK_ERROR };
  }
  if (!res.ok) return { ok: false, error: await errorOf(res) };

  if (!input.stream) {
    const parsed = completionSchema.safeParse(
      await res.json().catch(() => undefined),
    );
    if (!parsed.success) return { ok: false, error: BAD_RESPONSE };
    const reply = parsed.data.choices[0]?.message.content ?? "";
    onText(reply);
    return {
      ok: true,
      data: { reply, stats: parseStats(res.headers.get("x-tollgate-stats")) },
    };
  }
  return readStream(res, onText, signal);
}

const STATS_PREFIX = ": tollgate-stats ";

async function readStream(
  res: Response,
  onText: (reply: string) => void,
  signal: AbortSignal,
): Promise<GatewayResult<ChatOutcome>> {
  if (!res.body) return { ok: false, error: BAD_RESPONSE };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let stats: CallStats | null = null;
  let streamError: GatewayError | null = null;

  const handle = (line: string) => {
    if (line.startsWith(STATS_PREFIX)) {
      stats = parseStats(line.slice(STATS_PREFIX.length));
      return;
    }
    if (!line.startsWith("data: ") || line === "data: [DONE]") return;
    let json: unknown;
    try {
      json = JSON.parse(line.slice(6));
    } catch {
      return;
    }
    const chunk = streamChunkSchema.safeParse(json);
    if (!chunk.success) return;
    if (chunk.data.error) {
      streamError = {
        status: 0,
        code: chunk.data.error.code ?? "stream_error",
        message: chunk.data.error.message,
      };
      return;
    }
    const piece = chunk.data.choices?.[0]?.delta.content;
    if (piece) {
      reply += piece;
      onText(reply);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        handle(buffer.slice(0, newline).replace(/\r$/, ""));
        buffer = buffer.slice(newline + 1);
      }
    }
  } catch {
    return {
      ok: false,
      error: signal.aborted
        ? CANCELLED
        : { ...NETWORK_ERROR, message: "The stream was interrupted" },
    };
  }
  return streamError
    ? { ok: false, error: streamError }
    : { ok: true, data: { reply, stats } };
}
