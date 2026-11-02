"use client";

import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/data/panel";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorOf } from "@/lib/api/client";
import type { useAllowedModels } from "../hooks/use-playground";
import { virtualKeySchema } from "../schemas/playground";
import { usePlaygroundStore } from "../store/playground-store";

interface ConnectionCardProps {
  models: ReturnType<typeof useAllowedModels>;
  /** The model that will be used: the chosen one if the key allows it, else the first allowed. */
  model: string;
  disabled: boolean;
}

export function ConnectionCard({
  models,
  model,
  disabled,
}: ConnectionCardProps) {
  const apiKey = usePlaygroundStore((s) => s.key);
  const set = usePlaygroundStore((s) => s.set);
  const [visible, setVisible] = useState(false);

  const keyCheck =
    apiKey.trim() === "" ? null : virtualKeySchema.safeParse(apiKey);
  const keyError =
    keyCheck && !keyCheck.success
      ? keyCheck.error.issues[0]?.message
      : undefined;
  const rejected = models.isError ? apiErrorOf(models.error) : null;
  const modelItems = (models.data ?? []).map((id) => ({
    value: id,
    label: id,
  }));

  return (
    <Panel title="Connection" icon={KeyRound}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field data-invalid={Boolean(keyError ?? rejected)}>
          <FieldLabel htmlFor="playground-key">Virtual key</FieldLabel>
          <div className="relative">
            <Input
              id="playground-key"
              type={visible ? "text" : "password"}
              value={apiKey}
              onChange={(e) => set({ key: e.target.value })}
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              placeholder="tg_live_…"
              aria-invalid={Boolean(keyError ?? rejected)}
              disabled={disabled}
              className="h-10 pr-11 font-mono"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1"
              aria-label={visible ? "Hide key" : "Show key"}
              aria-pressed={visible}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <FieldDescription>
            Create one on the Virtual keys page. It stays in this browser tab
            and is sent only to your gateway.
          </FieldDescription>
          <FieldError>
            {keyError ??
              (rejected
                ? rejected.status === 401
                  ? "The gateway doesn’t accept this key. It may be revoked, expired or mistyped."
                  : rejected.message
                : undefined)}
          </FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="playground-model">Model</FieldLabel>
          {models.isFetching && !models.data ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select
              items={modelItems}
              value={model || null}
              onValueChange={(value) =>
                set({ model: (value as string | null) ?? "" })
              }
              disabled={disabled || modelItems.length === 0}
            >
              <SelectTrigger
                id="playground-model"
                className="h-10 w-full font-mono"
              >
                <SelectValue
                  placeholder={
                    models.data ? "No models on this key" : "Enter a key first"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {modelItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FieldDescription>
            Only the models this key is allowed to call.
          </FieldDescription>
        </Field>
      </div>
    </Panel>
  );
}
