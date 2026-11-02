import { StatusBadge, type BadgeTone } from "@/components/data/status-badge";

const LABELS: Record<string, string> = {
  budget_exceeded: "Over budget",
  rate_limit_exceeded: "Rate limited",
  request_too_large: "Too large",
  model_not_allowed: "Not allowed",
  model_not_found: "Unknown model",
  client_closed: "Cancelled",
};

function toneFor(status: number): BadgeTone {
  if (status < 400) return "success";
  if (status === 429 || status === 499) return "warning";
  return "danger";
}

export function RequestStatusBadge({
  statusCode,
  errorCode,
}: {
  statusCode: number;
  errorCode: string | null;
}) {
  const label =
    statusCode < 400
      ? "Success"
      : ((errorCode && LABELS[errorCode]) ?? `Error ${statusCode}`);
  return <StatusBadge tone={toneFor(statusCode)}>{label}</StatusBadge>;
}
