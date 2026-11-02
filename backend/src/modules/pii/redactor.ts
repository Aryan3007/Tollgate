import type { ChatCompletionRequest } from '../completions/dto/chat-completion-request.schema.js';
import type { ChatCompletion } from '../providers/types.js';
import { detectPii, type PiiEntity } from './detectors/index.js';
import { RedactionMap } from './redaction-map.js';

export function redactText(text: string, enabled: readonly PiiEntity[], map: RedactionMap): string {
  const matches = detectPii(text, enabled);
  if (matches.length === 0) return text;

  let out = '';
  let cursor = 0;
  for (const match of matches) {
    out += text.slice(cursor, match.start) + map.placeholderFor(match.type, match.value);
    cursor = match.end;
  }
  return out + text.slice(cursor);
}

type Message = ChatCompletionRequest['messages'][number];

function redactMessage(message: Message, enabled: readonly PiiEntity[], map: RedactionMap): Message {
  const next: Message = { ...message };
  const { content } = message;

  if (typeof content === 'string') {
    next.content = redactText(content, enabled, map);
  } else if (Array.isArray(content)) {
    next.content = content.map((part) =>
      part.type === 'text' && typeof part.text === 'string'
        ? { ...part, text: redactText(part.text, enabled, map) }
        : part,
    );
  }

  // Earlier assistant turns can carry tool-call arguments containing PII.
  if (Array.isArray(message.tool_calls)) {
    next.tool_calls = message.tool_calls.map((call: { function?: { arguments?: unknown } }) =>
      typeof call.function?.arguments === 'string'
        ? { ...call, function: { ...call.function, arguments: redactText(call.function.arguments, enabled, map) } }
        : call,
    );
  }
  return next;
}

/**
 * Masks PII in every message before the request leaves the gateway. Returns
 * a new request (the caller's is untouched) and the map needed to restore the
 * response. With nothing enabled the request passes through as-is.
 */
export function redactRequest(
  req: ChatCompletionRequest,
  enabled: readonly PiiEntity[],
): { request: ChatCompletionRequest; map: RedactionMap } {
  const map = new RedactionMap();
  if (enabled.length === 0) return { request: req, map };
  return { request: { ...req, messages: req.messages.map((m) => redactMessage(m, enabled, map)) }, map };
}

/** Puts the original values back into a non-streaming response. */
export function restoreCompletion(completion: ChatCompletion, map: RedactionMap): ChatCompletion {
  if (map.isEmpty) return completion;
  return {
    ...completion,
    choices: completion.choices.map((choice) => {
      const message = { ...choice.message };
      if (typeof message.content === 'string') message.content = map.restore(message.content);
      if (Array.isArray(message.tool_calls)) {
        message.tool_calls = message.tool_calls.map((call: { function?: { arguments?: unknown } }) =>
          typeof call.function?.arguments === 'string'
            ? { ...call, function: { ...call.function, arguments: map.restore(call.function.arguments) } }
            : call,
        );
      }
      return { ...choice, message };
    }),
  };
}
