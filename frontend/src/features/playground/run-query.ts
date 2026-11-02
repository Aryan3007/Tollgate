import { sendChat } from "./api/gateway-client";
import { newRunNonce, type Expectation, type Scenario } from "./presets";
import {
  maxTokensSchema,
  temperatureSchema,
  type CallStats,
} from "./schemas/playground";
import { usePlaygroundStore, type Entry } from "./store/playground-store";

// Module state, not React state: one request runs at a time, and Stop has to
// reach it from anywhere on the page.
let controller: AbortController | null = null;
let stopRequested = false;

export function stopRunning(): void {
  stopRequested = true;
  controller?.abort();
}

type Outcome = "ok" | "failed" | "stopped";

const store = () => usePlaygroundStore.getState();

function met(
  expect: Expectation | undefined,
  stats: CallStats | null,
): boolean | undefined {
  if (!expect) return undefined;
  if (!stats) return false;
  if (expect.cache && stats.cache !== expect.cache) return false;
  if (expect.minMasked !== undefined && stats.redactions < expect.minMasked)
    return false;
  return true;
}

function addError(text: string): void {
  usePlaygroundStore.setState((state) => ({
    entries: [
      ...state.entries,
      { id: crypto.randomUUID(), role: "error", text },
    ],
  }));
}

async function runQuery(
  prompt: string,
  model: string,
  step?: { expect: Expectation; why: string },
): Promise<Outcome> {
  const s = store();
  const temperature = temperatureSchema.safeParse(s.temperature);
  const maxTokens = maxTokensSchema.safeParse(s.maxTokens);
  if (!temperature.success || !maxTokens.success) {
    addError(
      temperature.error?.issues[0]?.message ??
        maxTokens.error?.issues[0]?.message ??
        "Check the settings",
    );
    return "failed";
  }

  const history = s.remember
    ? s.entries
        .filter(
          (e): e is Entry & { role: "user" | "assistant" } =>
            (e.role === "user" || e.role === "assistant") && !e.pending,
        )
        .map((e) => ({ role: e.role, content: e.text }))
    : [];
  const system = s.systemPrompt.trim();
  const messages = [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    ...history,
    { role: "user" as const, content: prompt },
  ];

  const replyId = crypto.randomUUID();
  usePlaygroundStore.setState((state) => ({
    entries: [
      ...state.entries,
      { id: crypto.randomUUID(), role: "user", text: prompt },
      {
        id: replyId,
        role: "assistant",
        text: "",
        pending: true,
        expect: step?.expect,
        why: step?.why,
      },
    ],
  }));

  controller = new AbortController();
  const result = await sendChat(
    {
      key: s.key.trim(),
      model,
      messages,
      temperature:
        temperature.data === "" ? undefined : Number(temperature.data),
      maxTokens: Number(maxTokens.data),
      stream: s.stream,
    },
    (reply) => store().update(replyId, { text: reply }),
    controller.signal,
  );
  controller = null;

  if (result.ok) {
    store().update(replyId, {
      pending: false,
      text: result.data.reply || "(empty reply)",
      stats: result.data.stats ?? undefined,
      statsMissing: result.data.stats === null,
      met: met(step?.expect, result.data.stats),
    });
    return "ok";
  }
  if (result.error.code === "cancelled") {
    const partial = store().entries.find((e) => e.id === replyId)?.text;
    store().update(replyId, {
      pending: false,
      text: partial ? `${partial} (stopped)` : "(stopped)",
    });
    return "stopped";
  }
  store().update(replyId, {
    role: "error",
    pending: false,
    text: result.error.message,
    met: step ? false : undefined,
  });
  return "failed";
}

export async function sendOne(prompt: string, model: string): Promise<void> {
  stopRequested = false;
  store().set({ running: true });
  try {
    await runQuery(prompt, model);
  } finally {
    store().set({ running: false });
  }
}

/** Runs the steps in order, and stops at the first failure or when Stop is pressed. */
export async function runScenario(
  scenario: Scenario,
  model: string,
): Promise<void> {
  stopRequested = false;
  const nonce = newRunNonce();
  store().set({ running: true });
  try {
    for (const [index, step] of scenario.steps.entries()) {
      if (stopRequested) break;
      store().set({
        progress: {
          title: scenario.title,
          step: index + 1,
          total: scenario.steps.length,
        },
      });
      const outcome = await runQuery(
        step.prompt.replaceAll("{n}", nonce),
        model,
        step,
      );
      if (outcome !== "ok") break;
    }
  } finally {
    store().set({ running: false, progress: null });
  }
}
