"use client";

import { FlaskConical, Play } from "lucide-react";
import { Panel } from "@/components/data/panel";
import { Button } from "@/components/ui/button";
import { QUICK_QUERIES, SCENARIOS, type Scenario } from "../presets";
import { usePlaygroundStore } from "../store/playground-store";

const RESULT_LABEL = {
  "hit-exact": "exact hit",
  "hit-semantic": "semantic hit",
  miss: "miss",
  skip: "not cached",
} as const;

interface PresetsPanelProps {
  disabled: boolean;
  onQuick: (prompt: string) => void;
  onScenario: (scenario: Scenario) => void;
}

export function PresetsPanel({
  disabled,
  onQuick,
  onScenario,
}: PresetsPanelProps) {
  const running = usePlaygroundStore((s) => s.running);
  const progress = usePlaygroundStore((s) => s.progress);
  const locked = disabled || running;

  return (
    <Panel title="Test queries" icon={FlaskConical}>
      <div className="flex flex-col gap-6">
        <section aria-label="Quick queries">
          <h3 className="text-sm font-medium text-muted-foreground">
            Send one
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_QUERIES.map((quick) => (
              <Button
                key={quick.id}
                variant="outline"
                size="lg"
                disabled={locked}
                title={quick.prompt}
                onClick={() => onQuick(quick.prompt)}
              >
                {quick.label}
              </Button>
            ))}
          </div>
        </section>

        <section aria-label="Test scenarios">
          <h3 className="text-sm font-medium text-muted-foreground">
            Run a scenario
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Sends the steps in order and checks each result against what should
            happen.
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {SCENARIOS.map((scenario) => {
              const active = progress?.title === scenario.title;
              return (
                <li key={scenario.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{scenario.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {scenario.description}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="lg"
                      className="shrink-0 gap-1.5"
                      disabled={locked}
                      onClick={() => onScenario(scenario)}
                      aria-label={`Run ${scenario.title}`}
                    >
                      <Play aria-hidden />
                      {active
                        ? `Step ${progress.step}/${progress.total}`
                        : "Run"}
                    </Button>
                  </div>
                  <ol className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                    {scenario.steps.map((step, index) => (
                      <li key={index} className="flex gap-2">
                        <span className="font-mono tabular-nums">
                          {index + 1}.
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={step.prompt.replaceAll("{n}", "####")}
                        >
                          {step.prompt
                            .replaceAll(" (ref {n})", "")
                            .replaceAll("{n}", "")}
                        </span>
                        <span className="shrink-0 text-foreground/70">
                          →{" "}
                          {step.expect.cache
                            ? RESULT_LABEL[step.expect.cache]
                            : "any"}
                        </span>
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Panel>
  );
}
