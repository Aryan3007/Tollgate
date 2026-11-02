import { Check, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Expectation } from "../presets";
import type { Entry } from "../store/playground-store";
import { MessageStats } from "./message-stats";

const CACHE_WORDS = {
  "hit-exact": "an exact cache hit",
  "hit-semantic": "a semantic cache hit",
  miss: "a cache miss",
  skip: "not cached",
} as const;

function describe(expect: Expectation): string {
  const parts = [
    expect.cache ? `expected ${CACHE_WORDS[expect.cache]}` : null,
    expect.minMasked ? `at least ${expect.minMasked} masked` : null,
  ];
  return parts.filter(Boolean).join(", ");
}

function Check_({ entry }: { entry: Entry }) {
  if (!entry.expect || entry.pending) return null;
  const ok = entry.met === true;
  const Icon = ok ? Check : X;
  return (
    <p
      className={cn(
        "mt-2 flex items-start gap-1.5 text-sm",
        ok ? "text-success-foreground" : "text-danger-foreground",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-medium">
          {ok ? "As expected" : "Not as expected"}
        </span>{" "}
        ({describe(entry.expect)}).{" "}
        <span className="text-muted-foreground">{entry.why}</span>
      </span>
    </p>
  );
}

export function MessageBubble({ entry }: { entry: Entry }) {
  if (entry.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] text-primary-foreground">
          {entry.text}
        </p>
      </div>
    );
  }

  if (entry.role === "error") {
    return (
      <div className="max-w-[85%]">
        <p
          role="alert"
          className="rounded-2xl rounded-bl-md bg-danger px-4 py-2.5 text-[15px] text-danger-foreground"
        >
          {entry.text}
        </p>
        <Check_ entry={entry} />
      </div>
    );
  }

  return (
    <div className="max-w-[92%]">
      <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-[15px]">
        {entry.pending && !entry.text ? (
          <div
            className="flex flex-col gap-2 py-1"
            aria-label="Waiting for the reply"
          >
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words">{entry.text}</p>
        )}
      </div>
      {entry.stats && <MessageStats stats={entry.stats} />}
      {entry.statsMissing && (
        <p role="status" className="mt-3 rounded-lg bg-warning px-3 py-2 text-sm text-warning-foreground">
          The gateway didn’t send cost and savings for this answer. Restart the backend on the latest build (
          <span className="font-mono">pnpm build && pnpm start</span> in <span className="font-mono">backend/</span>), then ask again.
        </p>
      )}
      <Check_ entry={entry} />
    </div>
  );
}
