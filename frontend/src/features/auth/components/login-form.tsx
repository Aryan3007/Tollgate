"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiErrorOf } from "@/lib/api/client";
import { useLogin } from "../hooks/use-auth";
import { loginInputSchema, type LoginInput } from "../schemas/session";

type FieldErrors = Partial<Record<keyof LoginInput, string>>;

/** Only same-app paths, so `next` cannot redirect to another site. */
function safeNext(next: string | null): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/spend";
}

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const login = useLogin();
  const [values, setValues] = useState<LoginInput>({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = loginInputSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      });
      return;
    }
    setErrors({});
    login.mutate(parsed.data, { onSuccess: () => router.replace(next) });
  }

  const serverError = login.isError ? apiErrorOf(login.error) : null;

  return (
    <div className="w-full max-w-sm rounded-2xl border bg-background p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg border">
          <ShieldCheck className="size-5 text-primary" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold leading-tight">
            Sign in to Tollgate
          </h1>
          <p className="text-sm text-muted-foreground">Admin dashboard</p>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-5">
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            maxLength={254}
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            aria-invalid={Boolean(errors.email)}
            className="h-10"
          />
          <FieldError>{errors.email}</FieldError>
        </Field>

        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={values.password}
            onChange={(e) => setValues({ ...values, password: e.target.value })}
            aria-invalid={Boolean(errors.password)}
            className="h-10"
          />
          <FieldError>{errors.password}</FieldError>
        </Field>

        {serverError && (
          <p
            role="alert"
            className="rounded-lg bg-danger px-3 py-2 text-sm text-danger-foreground"
          >
            {serverError.status === 429
              ? "Too many attempts. Wait a few minutes and try again."
              : serverError.message}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="h-10"
          disabled={login.isPending}
        >
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
