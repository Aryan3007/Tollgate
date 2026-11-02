"use client";

import { useEffect } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useAllowedModels, usePlaygroundRuns } from "../hooks/use-playground";
import { usePlaygroundStore } from "../store/playground-store";
import { ChatPanel } from "./chat-panel";
import { ConnectionCard } from "./connection-card";
import { PresetsPanel } from "./presets-panel";
import { SessionTotals } from "./session-totals";
import { SettingsCard } from "./settings-card";

export function PlaygroundView() {
  const apiKey = usePlaygroundStore((s) => s.key);
  const chosenModel = usePlaygroundStore((s) => s.model);
  const running = usePlaygroundStore((s) => s.running);
  const models = useAllowedModels(apiKey);
  const runs = usePlaygroundRuns();

  // The stored key is read after mount so the first render matches the server's.
  useEffect(() => {
    void usePlaygroundStore.persist.rehydrate();
  }, []);

  const allowed = models.data ?? [];
  const model = allowed.includes(chosenModel)
    ? chosenModel
    : (allowed[0] ?? "");
  const blockedReason = !apiKey.trim()
    ? "Enter a virtual key above to start"
    : models.isError
      ? "The key was not accepted"
      : !model
        ? "Checking the key…"
        : null;

  return (
    <>
      <PageHeader
        title="Playground"
        description="Chat through your gateway with a virtual key and see what each request costs, what the cache saved, and what personal data was masked."
      />
      <ConnectionCard models={models} model={model} disabled={running} />
      <SessionTotals />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <ChatPanel
          blockedReason={blockedReason}
          onSend={(prompt) => runs.send(prompt, model)}
        />
        <div className="flex flex-col gap-6">
          <PresetsPanel
            disabled={blockedReason !== null}
            onQuick={(prompt) => runs.send(prompt, model)}
            onScenario={(scenario) => runs.runScenario(scenario, model)}
          />
          <SettingsCard />
        </div>
      </div>
    </>
  );
}
