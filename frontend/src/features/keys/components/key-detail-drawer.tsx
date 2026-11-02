"use client";

import { Activity } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { ErrorState } from "@/components/data/error-state";
import { TableSkeleton } from "@/components/data/table-skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequestStatusBadge } from "@/features/request-feed/components/request-status-badge";
import { useRequests } from "@/features/request-feed/hooks/use-requests";
import { apiErrorOf } from "@/lib/api/client";
import {
  formatCount,
  formatDate,
  formatDateTime,
  formatInr,
  formatLatency,
} from "@/lib/format";
import { useKeys } from "../hooks/use-keys";
import type { VirtualKey } from "../schemas/key";
import { useKeysUiStore } from "../store/keys-ui-store";
import { KeyStatusBadge } from "./key-status-badge";

const POLL_MS = 5_000;
const RECENT = 20;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-2 text-[15px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function RecentRequests({ keyId }: { keyId: string }) {
  const requests = useRequests(
    { page: 1, limit: RECENT, keyId },
    { pollMs: POLL_MS },
  );
  const cell = "px-4 py-3";

  if (requests.isError) {
    return (
      <ErrorState
        error={apiErrorOf(requests.error)}
        onRetry={() => requests.refetch()}
      />
    );
  }
  if (requests.isSuccess && requests.data.total === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No requests yet"
        description="Calls made with this key show up here within a few seconds."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {["Time", "Model", "Status", "Tokens", "Cost", "Latency"].map(
              (column, index) => (
                <TableHead
                  key={column}
                  className={`${cell} h-10 text-sm font-medium text-muted-foreground ${index >= 3 ? "text-right" : ""}`}
                >
                  {column}
                </TableHead>
              ),
            )}
          </TableRow>
        </TableHeader>
        {requests.isPending ? (
          <TableSkeleton columns={6} rows={4} />
        ) : (
          <TableBody>
            {requests.data.data.map((log) => (
              <TableRow key={log.id} className="text-sm">
                <TableCell
                  className={`${cell} whitespace-nowrap text-muted-foreground`}
                >
                  {formatDateTime(log.createdAt)}
                </TableCell>
                <TableCell className={`${cell} font-mono text-[13px]`}>
                  {log.requestedModel}
                </TableCell>
                <TableCell className={cell}>
                  <RequestStatusBadge
                    statusCode={log.statusCode}
                    errorCode={log.errorCode}
                  />
                </TableCell>
                <TableCell
                  className={`${cell} text-right font-mono tabular-nums`}
                >
                  {formatCount(log.inputTokens + log.outputTokens)}
                </TableCell>
                <TableCell
                  className={`${cell} text-right font-mono tabular-nums`}
                >
                  {formatInr(log.costMicroInr)}
                </TableCell>
                <TableCell
                  className={`${cell} text-right font-mono tabular-nums`}
                >
                  {formatLatency(log.latencyMs)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        )}
      </Table>
    </div>
  );
}

function KeyDetail({ vkey }: { vkey: VirtualKey }) {
  return (
    <div className="flex flex-col gap-6 pb-6">
      <section
        aria-label="Usage this month"
        className="grid grid-cols-1 gap-3 px-6 pt-6 sm:grid-cols-3"
      >
        <Stat label="Requests" value={formatCount(vkey.usage.requests)} />
        <Stat
          label="Tokens"
          value={formatCount(vkey.usage.inputTokens + vkey.usage.outputTokens)}
        />
        <Stat label="Spend" value={formatInr(vkey.usage.costMicroInr)} />
      </section>

      <dl className="divide-y px-6">
        <Detail label="Status">
          <KeyStatusBadge status={vkey.status} />
        </Detail>
        <Detail label="Team">{vkey.teamName}</Detail>
        <Detail label="Models">
          <span className="font-mono text-sm">
            {vkey.allowedModels.join(", ")}
          </span>
        </Detail>
        <Detail label="Limits">
          {vkey.rpmLimit
            ? `${formatCount(vkey.rpmLimit)} req/min`
            : "Team default"}
          {" · "}
          {vkey.tpmLimit
            ? `${formatCount(vkey.tpmLimit)} tok/min`
            : "Team default"}
        </Detail>
        <Detail label="Last used">
          {vkey.lastUsedAt ? formatDateTime(vkey.lastUsedAt) : "Never"}
        </Detail>
        <Detail label="Expires">
          {vkey.expiresAt ? formatDate(vkey.expiresAt) : "Never"}
        </Detail>
        <Detail label="Created">{formatDate(vkey.createdAt)}</Detail>
      </dl>

      <section aria-label="Recent requests" className="flex flex-col gap-3">
        <h3 className="px-6 text-base font-medium">Recent requests</h3>
        <div className="border-y">
          <RecentRequests keyId={vkey.id} />
        </div>
      </section>
    </div>
  );
}

/** Read-only view of one key: this month's usage and its latest requests (refreshed every 5 s). */
export function KeyDetailDrawer() {
  const selectedId = useKeysUiStore((s) => s.selectedKeyId);
  const setSelectedId = useKeysUiStore((s) => s.setSelectedKeyId);
  const page = useKeysUiStore((s) => s.page);
  const status = useKeysUiStore((s) => s.status);
  // Reads from the table's cached page and refreshes with it, so usage stays current.
  const keys = useKeys(
    { page, limit: 20, status },
    { pollMs: selectedId ? POLL_MS : undefined },
  );
  const vkey = keys.data?.data.find((k) => k.id === selectedId);

  return (
    <Sheet
      open={selectedId !== null}
      onOpenChange={(open) => !open && setSelectedId(null)}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle className="text-lg">{vkey?.name ?? "Key"}</SheetTitle>
          <SheetDescription className="font-mono">
            {vkey ? `${vkey.prefix}…` : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {vkey && <KeyDetail vkey={vkey} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
