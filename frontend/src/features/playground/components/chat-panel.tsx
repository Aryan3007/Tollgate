"use client";

import { MessagesSquare, Send, Square, Trash2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { EmptyState } from "@/components/data/empty-state";
import { Panel } from "@/components/data/panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { stopRunning } from "../run-query";
import { usePlaygroundStore } from "../store/playground-store";
import { MessageBubble } from "./message-bubble";

const MAX_PROMPT_CHARS = 4000;

interface ChatPanelProps {
  /** Why sending is not possible yet, shown instead of the composer's hint. */
  blockedReason: string | null;
  onSend: (prompt: string) => void;
}

export function ChatPanel({ blockedReason, onSend }: ChatPanelProps) {
  const entries = usePlaygroundStore((s) => s.entries);
  const running = usePlaygroundStore((s) => s.running);
  const progress = usePlaygroundStore((s) => s.progress);
  const clear = usePlaygroundStore((s) => s.clear);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as replies stream in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries]);

  const canSend = !blockedReason && !running && draft.trim().length > 0;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    onSend(draft.trim());
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <Panel
      title="Conversation"
      icon={MessagesSquare}
      flush
      className="xl:sticky xl:top-0 xl:self-start"
      actions={
        <Button
          variant="ghost"
          size="lg"
          className="gap-2"
          onClick={clear}
          disabled={running || entries.length === 0}
        >
          <Trash2 aria-hidden />
          Clear
        </Button>
      }
    >
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="h-[480px] overflow-y-auto px-4 py-5 sm:px-6"
      >
        {entries.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="Ask something"
            description="Type below, or pick a test query on the right. Each answer shows what it cost and what the cache saved."
          />
        ) : (
          <div className="flex flex-col gap-5">
            {entries.map((entry) => (
              <MessageBubble key={entry.id} entry={entry} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="border-t px-4 py-4 sm:px-6">
        {progress && (
          <p className="mb-2 text-sm text-muted-foreground">
            Running “{progress.title}”: step {progress.step} of {progress.total}
          </p>
        )}
        <div className="flex items-end gap-3">
          <Textarea
            aria-label="Your message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_PROMPT_CHARS}
            rows={2}
            disabled={Boolean(blockedReason)}
            placeholder={
              blockedReason ??
              "Ask anything. Enter to send, Shift+Enter for a new line"
            }
            className="max-h-40 min-h-12 resize-none text-[15px]"
          />
          {running ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 gap-2 px-4"
              onClick={stopRunning}
            >
              <Square aria-hidden />
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              className="h-12 gap-2 px-4"
              disabled={!canSend}
            >
              <Send aria-hidden />
              Send
            </Button>
          )}
        </div>
      </form>
    </Panel>
  );
}
