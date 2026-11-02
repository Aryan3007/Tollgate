import type { ChatCompletionChunk } from '../../providers/types.js';
import type { RedactionMap } from '../redaction-map.js';
import { StreamRestorer } from './stream-restorer.js';

type ToolCallDelta = { index: number; function?: { name?: string; arguments?: string } };

/**
 * Restores placeholders across a whole chat stream: each choice's text, and
 * each streamed tool call's arguments, has its own buffer.
 */
export class ChunkRestorer {
  private readonly text = new Map<number, StreamRestorer>();
  private readonly args = new Map<string, StreamRestorer>();

  constructor(private readonly map: RedactionMap) {}

  transform(chunk: ChatCompletionChunk): ChatCompletionChunk {
    if (this.map.isEmpty) return chunk;

    return {
      ...chunk,
      choices: chunk.choices.map((choice) => {
        const delta = { ...choice.delta };
        const finished = choice.finish_reason != null;

        if (typeof delta.content === 'string' || finished) {
          const restorer = this.textRestorer(choice.index);
          const content = restorer.push(typeof delta.content === 'string' ? delta.content : '');
          // Held text must go out with the final chunk, not after it.
          const withTail = finished ? content + restorer.flush() : content;
          if (typeof delta.content === 'string' || withTail) delta.content = withTail;
        }

        const toolCalls = Array.isArray(delta.tool_calls) ? (delta.tool_calls as ToolCallDelta[]) : [];
        const touched = new Set<number>();
        const restored = toolCalls.map((call) => {
          touched.add(call.index);
          const piece = call.function?.arguments;
          return typeof piece === 'string'
            ? { ...call, function: { ...call.function, arguments: this.argsRestorer(choice.index, call.index).push(piece) } }
            : call;
        });
        if (finished) {
          // Tool calls that streamed arguments but weren't in this chunk still need their tail.
          for (const [key, restorer] of this.args) {
            const [choiceIndex, toolIndex] = key.split(':').map(Number) as [number, number];
            if (choiceIndex !== choice.index || !restorer.hasPending) continue;
            const tail = restorer.flush();
            const existing = restored.find((c) => c.index === toolIndex);
            if (existing) existing.function = { ...existing.function, arguments: (existing.function?.arguments ?? '') + tail };
            else restored.push({ index: toolIndex, function: { arguments: tail } });
          }
        }
        if (restored.length > 0) delta.tool_calls = restored;

        return { ...choice, delta };
      }),
    };
  }

  private textRestorer(choice: number): StreamRestorer {
    let restorer = this.text.get(choice);
    if (!restorer) this.text.set(choice, (restorer = new StreamRestorer(this.map)));
    return restorer;
  }

  private argsRestorer(choice: number, tool: number): StreamRestorer {
    const key = `${choice}:${tool}`;
    let restorer = this.args.get(key);
    if (!restorer) this.args.set(key, (restorer = new StreamRestorer(this.map)));
    return restorer;
  }
}
