import { StatusBadge, type BadgeTone } from "@/components/data/status-badge";
import type { KeyStatus } from "../schemas/key";

const tone: Record<KeyStatus, BadgeTone> = {
  active: "success",
  expired: "warning",
  revoked: "neutral",
};

const label: Record<KeyStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

export function KeyStatusBadge({ status }: { status: KeyStatus }) {
  return <StatusBadge tone={tone[status]}>{label[status]}</StatusBadge>;
}
