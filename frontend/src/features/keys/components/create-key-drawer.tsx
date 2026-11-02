"use client";

import { AlertTriangle, Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormDrawer } from "@/components/data/form-drawer";
import { TextField } from "@/components/data/text-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeams } from "@/features/teams/hooks/use-teams";
import { apiErrorOf } from "@/lib/api/client";
import { fieldErrors, type FormErrors } from "@/lib/form";
import { useCreateKey, useModels } from "../hooks/use-keys";
import {
  keyFormSchema,
  type CreatedKey,
  type KeyFormValues,
} from "../schemas/key";
import { useKeysUiStore } from "../store/keys-ui-store";

const EMPTY: KeyFormValues = {
  teamId: "",
  name: "",
  allowedModels: [],
  rpmLimit: "",
  tpmLimit: "",
  expiresOn: "",
};

function SecretReveal({
  created,
  onDone,
}: {
  created: CreatedKey;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(created.secret);
    setCopied(true);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-5 px-6 py-6">
        <div className="flex gap-3 rounded-lg bg-warning px-4 py-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Copy this key now. Tollgate only stores a hash of it, so it can’t be
            shown again.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">{created.key.name}</p>
          <p className="text-sm text-muted-foreground">
            {created.key.teamName}
          </p>
        </div>
        <div className="flex items-stretch gap-2">
          <code
            className="min-w-0 flex-1 break-all rounded-lg border bg-muted px-3 py-2.5 font-mono text-sm"
            aria-label="New virtual key"
          >
            {created.secret}
          </code>
          <Button
            variant="outline"
            size="lg"
            className="h-auto gap-2 px-3"
            onClick={copy}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Use it as the API key in any OpenAI SDK, with the base URL set to this
          gateway’s <span className="font-mono">/v1</span>.
        </p>
      </div>
      <div className="mt-auto flex justify-end border-t px-6 py-4">
        <Button size="lg" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function CreateKeyDrawer() {
  const open = useKeysUiStore((s) => s.createOpen);
  const setOpen = useKeysUiStore((s) => s.setCreateOpen);
  const teams = useTeams({
    page: 1,
    limit: 100,
    sortBy: "name",
    sortOrder: "asc",
  });
  const models = useModels();
  const createKey = useCreateKey();
  const [values, setValues] = useState<KeyFormValues>(EMPTY);
  const [errors, setErrors] = useState<FormErrors<KeyFormValues>>({});

  const set =
    <K extends keyof KeyFormValues>(field: K) =>
    (value: KeyFormValues[K]) =>
      setValues((current) => ({ ...current, [field]: value }));

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      setValues(EMPTY);
      setErrors({});
      createKey.reset();
    }
  }

  function toggleModel(alias: string, checked: boolean) {
    set("allowedModels")(
      checked
        ? [...values.allowedModels, alias]
        : values.allowedModels.filter((m) => m !== alias),
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = keyFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    const { expiresOn, ...rest } = parsed.data;
    createKey.mutate({ ...rest, expiresAt: expiresOn?.toISOString() });
  }

  const teamItems = (teams.data?.data ?? []).map((team) => ({
    value: team.id,
    label: team.name,
  }));
  const noTeams = teams.isSuccess && teams.data.total === 0;

  return (
    <FormDrawer
      open={open}
      onOpenChange={close}
      title={createKey.isSuccess ? "Key created" : "New virtual key"}
      description={
        createKey.isSuccess
          ? "Hand this key to the app that will call the gateway."
          : "Apps use virtual keys instead of real provider keys. Each key is scoped to a team and a set of models."
      }
    >
      {createKey.isSuccess ? (
        <SecretReveal created={createKey.data} onDone={() => close(false)} />
      ) : noTeams ? (
        <div className="flex flex-col gap-4 px-6 py-6 text-[15px]">
          <p>Keys belong to a team, and there are no teams yet.</p>
          <Link
            href="/teams"
            onClick={() => close(false)}
            className={buttonVariants({ size: "lg", className: "w-fit px-4" })}
          >
            Create a team first
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col">
          <div className="flex flex-col gap-5 px-6 py-6">
            <Field data-invalid={Boolean(errors.teamId)}>
              <FieldLabel htmlFor="key-team">Team</FieldLabel>
              {teams.isPending ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  items={teamItems}
                  value={values.teamId || null}
                  onValueChange={(v) =>
                    set("teamId")((v as string | null) ?? "")
                  }
                >
                  <SelectTrigger
                    id="key-team"
                    className="h-10 w-full"
                    aria-invalid={Boolean(errors.teamId)}
                  >
                    <SelectValue placeholder="Choose a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FieldError>
                {errors.teamId ??
                  (teams.isError ? "Couldn’t load teams" : undefined)}
              </FieldError>
            </Field>

            <TextField
              id="key-name"
              label="Name"
              value={values.name}
              onChange={set("name")}
              error={errors.name}
              maxLength={100}
              autoComplete="off"
              placeholder="support-bot-prod"
            />

            <FieldSet data-invalid={Boolean(errors.allowedModels)}>
              <FieldLegend variant="label">Allowed models</FieldLegend>
              {models.isPending ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-6 w-48" />
                  ))}
                </div>
              ) : models.isError ? (
                <FieldError>Couldn’t load models</FieldError>
              ) : (
                <div className="flex flex-col gap-3">
                  {models.data.data.map((model) => {
                    const id = `model-${model.alias}`;
                    return (
                      <div
                        key={model.alias}
                        className="flex items-center gap-3"
                      >
                        <Checkbox
                          id={id}
                          checked={values.allowedModels.includes(model.alias)}
                          onCheckedChange={(checked) =>
                            toggleModel(model.alias, checked)
                          }
                        />
                        <label
                          htmlFor={id}
                          className="flex flex-1 items-baseline justify-between gap-3 text-[15px]"
                        >
                          <span className="font-mono text-sm">
                            {model.alias}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {model.providerKind}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
              <FieldError>{errors.allowedModels}</FieldError>
            </FieldSet>

            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                id="key-rpm"
                label="Requests / min"
                value={values.rpmLimit}
                onChange={set("rpmLimit")}
                error={errors.rpmLimit}
                inputMode="numeric"
                maxLength={6}
                placeholder="Team default"
              />
              <TextField
                id="key-tpm"
                label="Tokens / min"
                value={values.tpmLimit}
                onChange={set("tpmLimit")}
                error={errors.tpmLimit}
                inputMode="numeric"
                maxLength={9}
                placeholder="Team default"
              />
            </div>

            <TextField
              id="key-expires"
              label="Expires on"
              type="date"
              value={values.expiresOn}
              onChange={set("expiresOn")}
              error={errors.expiresOn}
              description="Optional. The key stops working at the end of this day."
            />

            {createKey.isError && (
              <p
                role="alert"
                className="rounded-lg bg-danger px-3 py-2 text-sm text-danger-foreground"
              >
                {apiErrorOf(createKey.error).message}
              </p>
            )}
          </div>
          <div className="mt-auto flex justify-end gap-3 border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => close(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={createKey.isPending}>
              {createKey.isPending ? "Creating…" : "Create key"}
            </Button>
          </div>
        </form>
      )}
    </FormDrawer>
  );
}
