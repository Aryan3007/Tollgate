import type { ComponentProps } from "react";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface TextFieldProps extends Omit<
  ComponentProps<"input">,
  "onChange" | "value"
> {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  description?: string;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  description,
  ...input
}: TextFieldProps) {
  const describedBy = description ? `${id}-description` : undefined;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className="h-10"
        {...input}
      />
      {description && (
        <FieldDescription id={describedBy}>{description}</FieldDescription>
      )}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
