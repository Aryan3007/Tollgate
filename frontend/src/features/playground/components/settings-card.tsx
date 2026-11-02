"use client";

import { SlidersHorizontal } from "lucide-react";
import { Panel } from "@/components/data/panel";
import { TextField } from "@/components/data/text-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { maxTokensSchema, temperatureSchema } from "../schemas/playground";
import { usePlaygroundStore } from "../store/playground-store";

export function SettingsCard() {
  const s = usePlaygroundStore();
  const temperatureError = temperatureSchema.safeParse(s.temperature).error
    ?.issues[0]?.message;
  const maxTokensError = maxTokensSchema.safeParse(s.maxTokens).error?.issues[0]
    ?.message;

  return (
    <Panel title="Request settings" icon={SlidersHorizontal}>
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <TextField
            id="playground-temperature"
            label="Temperature"
            value={s.temperature}
            onChange={(temperature) => s.set({ temperature })}
            error={temperatureError}
            inputMode="decimal"
            maxLength={4}
            description="Answers are cached only at or below your team’s limit (0 by default). Leave blank for the provider default (1), which is never cached."
          />
          <TextField
            id="playground-max-tokens"
            label="Max reply tokens"
            value={s.maxTokens}
            onChange={(maxTokens) => s.set({ maxTokens })}
            error={maxTokensError}
            inputMode="numeric"
            maxLength={4}
            description="Caps the reply length, and so the cost."
          />
        </div>

        <Field>
          <FieldLabel htmlFor="playground-system">System prompt</FieldLabel>
          <Textarea
            id="playground-system"
            value={s.systemPrompt}
            onChange={(e) => s.set({ systemPrompt: e.target.value })}
            maxLength={2000}
            rows={3}
            className="min-h-20 resize-y text-[15px]"
          />
          <FieldDescription>
            Part of the cache key: a different system prompt never shares
            answers.
          </FieldDescription>
        </Field>

        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="playground-stream"
              checked={s.stream}
              onCheckedChange={(stream) => s.set({ stream })}
              className="mt-0.5"
            />
            <label htmlFor="playground-stream" className="text-[15px]">
              Stream the reply
              <span className="block text-sm text-muted-foreground">
                Words appear as they arrive. Cost is reported when the stream
                ends.
              </span>
            </label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="playground-remember"
              checked={s.remember}
              onCheckedChange={(remember) => s.set({ remember })}
              className="mt-0.5"
            />
            <label htmlFor="playground-remember" className="text-[15px]">
              Remember the conversation
              <span className="block text-sm text-muted-foreground">
                Off: each question is sent alone, so repeated questions can hit
                the cache.
              </span>
            </label>
          </div>
        </div>
      </div>
    </Panel>
  );
}
