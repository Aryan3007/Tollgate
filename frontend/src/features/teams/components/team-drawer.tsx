"use client";

import { useState, type FormEvent } from "react";
import { FormDrawer } from "@/components/data/form-drawer";
import { TextField } from "@/components/data/text-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { apiErrorOf } from "@/lib/api/client";
import { fieldErrors, type FormErrors } from "@/lib/form";
import { rupeesToMicro } from "@/lib/format";
import { useCreateTeam, useUpdateTeam } from "../hooks/use-teams";
import {
  PII_TYPES,
  teamFormSchema,
  type PiiType,
  type Team,
  type TeamFormValues,
} from "../schemas/team";
import { useTeamsUiStore } from "../store/teams-ui-store";

const EMPTY: TeamFormValues = {
  name: "",
  monthlyBudgetInr: "",
  rpmLimit: "600",
  tpmLimit: "200000",
  defaultMaxTokens: "1024",
  piiEntities: PII_TYPES.map((t) => t.value),
  cacheEnabled: true,
  cacheMaxTemperature: "0",
};

function valuesFromTeam(team: Team): TeamFormValues {
  return {
    name: team.name,
    // Whole micro-rupees to rupees, keeping at most the two decimals the form accepts.
    monthlyBudgetInr: String(
      Number((team.monthlyBudgetMicroInr / 1_000_000).toFixed(2)),
    ),
    rpmLimit: String(team.rpmLimit),
    tpmLimit: String(team.tpmLimit),
    defaultMaxTokens: String(team.defaultMaxTokens),
    piiEntities: team.piiEntities,
    cacheEnabled: team.cacheEnabled,
    cacheMaxTemperature: String(team.cacheMaxTemperature),
  };
}

/** Create or edit a team. The form mounts only while open, so every open starts fresh. */
export function TeamDrawer() {
  const drawer = useTeamsUiStore((s) => s.drawer);
  const closeDrawer = useTeamsUiStore((s) => s.closeDrawer);
  const editing = drawer?.mode === "edit" ? drawer.team : undefined;

  return (
    <FormDrawer
      open={drawer !== null}
      onOpenChange={(open) => !open && closeDrawer()}
      title={editing ? `Edit ${editing.name}` : "New team"}
      description={
        editing
          ? "Changes apply to all of this team's keys on their next request."
          : "Teams own virtual keys and share one monthly budget and rate limit."
      }
    >
      {drawer && (
        <TeamForm
          key={editing?.id ?? "new"}
          team={editing}
          onDone={closeDrawer}
        />
      )}
    </FormDrawer>
  );
}

function TeamForm({ team, onDone }: { team?: Team; onDone: () => void }) {
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const mutation = team ? updateTeam : createTeam;
  const [values, setValues] = useState<TeamFormValues>(
    team ? valuesFromTeam(team) : EMPTY,
  );
  const [errors, setErrors] = useState<FormErrors<TeamFormValues>>({});

  const set =
    (field: Exclude<keyof TeamFormValues, "piiEntities" | "cacheEnabled">) =>
    (value: string) =>
      setValues((current) => ({ ...current, [field]: value }));

  const togglePii = (type: PiiType, checked: boolean) =>
    setValues((current) => ({
      ...current,
      piiEntities: checked
        ? [...current.piiEntities, type]
        : current.piiEntities.filter((t) => t !== type),
    }));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = teamFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    const { monthlyBudgetInr, ...rest } = parsed.data;
    const input = {
      ...rest,
      monthlyBudgetMicroInr: rupeesToMicro(monthlyBudgetInr),
    };
    const handlers = {
      onSuccess: onDone,
      onError: (error: unknown) => {
        const apiError = apiErrorOf(error);
        if (apiError.code === "team_name_taken")
          setErrors({ name: apiError.message });
      },
    };

    if (team) updateTeam.mutate({ id: team.id, input }, handlers);
    else createTeam.mutate(input, handlers);
  }

  const failure = mutation.isError ? apiErrorOf(mutation.error) : null;
  const serverError =
    failure && failure.code !== "team_name_taken" ? failure.message : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col">
      <div className="flex flex-col gap-5 px-6 py-6">
        <TextField
          id="team-name"
          label="Name"
          value={values.name}
          onChange={set("name")}
          error={errors.name}
          maxLength={100}
          autoComplete="off"
        />
        <TextField
          id="team-budget"
          label="Monthly budget (₹)"
          value={values.monthlyBudgetInr}
          onChange={set("monthlyBudgetInr")}
          error={errors.monthlyBudgetInr}
          inputMode="decimal"
          maxLength={13}
          placeholder="5000"
          description="Requests are refused once the team's spend for the month reaches this."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="team-rpm"
            label="Requests / min"
            value={values.rpmLimit}
            onChange={set("rpmLimit")}
            error={errors.rpmLimit}
            inputMode="numeric"
            maxLength={6}
          />
          <TextField
            id="team-tpm"
            label="Tokens / min"
            value={values.tpmLimit}
            onChange={set("tpmLimit")}
            error={errors.tpmLimit}
            inputMode="numeric"
            maxLength={9}
          />
        </div>
        <TextField
          id="team-max-tokens"
          label="Default max tokens"
          value={values.defaultMaxTokens}
          onChange={set("defaultMaxTokens")}
          error={errors.defaultMaxTokens}
          inputMode="numeric"
          maxLength={6}
          description="Used to estimate cost when a request doesn't set max_tokens."
        />
        <FieldSet>
          <FieldLegend variant="label">Mask personal data</FieldLegend>
          <FieldDescription>
            Replaced with placeholders before a request reaches a provider, and
            put back in the response.
          </FieldDescription>
          <div className="flex flex-col gap-3">
            {PII_TYPES.map((type) => {
              const id = `pii-${type.value}`;
              return (
                <div key={type.value} className="flex items-center gap-3">
                  <Checkbox
                    id={id}
                    checked={values.piiEntities.includes(type.value)}
                    onCheckedChange={(checked) =>
                      togglePii(type.value, checked)
                    }
                  />
                  <label htmlFor={id} className="text-[15px]">
                    {type.label}
                  </label>
                </div>
              );
            })}
          </div>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">Answer cache</FieldLegend>
          <FieldDescription>
            Repeated and near-identical prompts are answered from the cache at
            no cost. Never used when personal data was masked, or when tools are
            involved.
          </FieldDescription>
          <div className="flex items-center gap-3">
            <Checkbox
              id="team-cache"
              checked={values.cacheEnabled}
              onCheckedChange={(checked) =>
                setValues((current) => ({ ...current, cacheEnabled: checked }))
              }
            />
            <label htmlFor="team-cache" className="text-[15px]">
              Cache answers
            </label>
          </div>
          {values.cacheEnabled && (
            <TextField
              id="team-cache-temp"
              label="Cache requests up to temperature"
              value={values.cacheMaxTemperature}
              onChange={set("cacheMaxTemperature")}
              error={errors.cacheMaxTemperature}
              inputMode="decimal"
              maxLength={4}
              description="0 caches only deterministic requests. A request that omits temperature counts as 1."
            />
          )}
        </FieldSet>
        {serverError && (
          <p
            role="alert"
            className="rounded-lg bg-danger px-3 py-2 text-sm text-danger-foreground"
          >
            {serverError}
          </p>
        )}
      </div>
      <div className="mt-auto flex justify-end gap-3 border-t px-6 py-4">
        <Button type="button" variant="outline" size="lg" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={mutation.isPending}>
          {mutation.isPending
            ? "Saving…"
            : team
              ? "Save changes"
              : "Create team"}
        </Button>
      </div>
    </form>
  );
}
