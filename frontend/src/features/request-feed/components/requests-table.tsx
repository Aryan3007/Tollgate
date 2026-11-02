"use client";

import { Activity } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { ErrorState } from "@/components/data/error-state";
import { FilterTabs } from "@/components/data/filter-tabs";
import { Pagination } from "@/components/data/pagination";
import { TableSkeleton } from "@/components/data/table-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiErrorOf } from "@/lib/api/client";
import { env } from "@/lib/env";
import {
  formatCount,
  formatDateTime,
  formatInr,
  formatLatency,
} from "@/lib/format";
import { useRequests } from "../hooks/use-requests";
import { useRequestsUiStore, type Outcome } from "../store/requests-ui-store";
import { RequestStatusBadge } from "./request-status-badge";

const PAGE_SIZE = 25;
const POLL_MS = 3_000;
const COLUMNS = [
  "Time",
  "Key",
  "Model",
  "Status",
  "Tokens in / out",
  "Cost",
  "Latency",
];
const NUMERIC = new Set(["Tokens in / out", "Cost", "Latency"]);
const cell = "px-4 py-3.5 sm:px-6";
const numeric = `${cell} text-right font-mono tabular-nums`;

const OUTCOMES: ReadonlyArray<{ value: Outcome; label: string }> = [
  { value: undefined, label: "All" },
  { value: "success", label: "Successful" },
  { value: "error", label: "Errors" },
];

export function RequestsTable() {
  const page = useRequestsUiStore((s) => s.page);
  const outcome = useRequestsUiStore((s) => s.outcome);
  const setPage = useRequestsUiStore((s) => s.setPage);
  const setOutcome = useRequestsUiStore((s) => s.setOutcome);
  // Only the newest page refreshes: polling older pages would shift rows while reading.
  const requests = useRequests(
    { page, limit: PAGE_SIZE, outcome },
    { pollMs: page === 1 ? POLL_MS : undefined },
  );

  let body;
  if (requests.isError) {
    body = (
      <ErrorState
        error={apiErrorOf(requests.error)}
        onRetry={() => requests.refetch()}
      />
    );
  } else if (requests.isSuccess && requests.data.total === 0) {
    body = outcome ? (
      <EmptyState
        icon={Activity}
        title={
          outcome === "error" ? "No failed requests" : "No successful requests"
        }
        description="Requests with this outcome will show up here."
      />
    ) : (
      <EmptyState
        icon={Activity}
        title="No requests yet"
        description={
          <>
            Point any OpenAI SDK at{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
              {env.NEXT_PUBLIC_API_URL}/v1
            </code>{" "}
            and requests appear here as they happen.
          </>
        }
      />
    );
  } else {
    body = (
      <>
        <div className="overflow-x-auto">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {COLUMNS.map((column) => (
                  <TableHead
                    key={column}
                    className={`${cell} h-11 text-sm font-medium text-muted-foreground ${NUMERIC.has(column) ? "text-right" : ""}`}
                  >
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            {requests.isPending ? (
              <TableSkeleton columns={COLUMNS.length} rows={8} />
            ) : (
              <TableBody>
                {requests.data.data.map((log) => (
                  <TableRow key={log.id} className="text-[15px]">
                    <TableCell
                      className={`${cell} whitespace-nowrap text-muted-foreground`}
                    >
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell className={cell}>
                      <p className="font-medium">
                        {log.keyName ?? "Deleted key"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {log.teamName ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell className={cell}>
                      <p className="font-mono text-[13px]">
                        {log.requestedModel}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          log.provider,
                          log.streamed ? "stream" : null,
                          log.failoverCount > 0 ? `failed over ×${log.failoverCount}` : null,
                          log.redactionCount > 0 ? `${log.redactionCount} masked` : null,
                          log.cacheStatus === "exact" ? "cache hit" : null,
                          log.cacheStatus === "semantic" ? "semantic hit" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </TableCell>
                    <TableCell className={cell}>
                      <RequestStatusBadge
                        statusCode={log.statusCode}
                        errorCode={log.errorCode}
                      />
                    </TableCell>
                    <TableCell className={numeric}>
                      {formatCount(log.inputTokens)} /{" "}
                      {formatCount(log.outputTokens)}
                    </TableCell>
                    <TableCell className={numeric}>
                      {formatInr(log.costMicroInr)}
                      {log.savedMicroInr > 0 && (
                        <p className="text-xs text-success-foreground">
                          saved {formatInr(log.savedMicroInr)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className={numeric}>
                      {formatLatency(log.latencyMs)}
                      {log.ttfbMs !== null && (
                        <p className="text-xs text-muted-foreground">
                          first token {formatLatency(log.ttfbMs)}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
        {requests.isSuccess && (
          <Pagination
            page={page}
            limit={PAGE_SIZE}
            total={requests.data.total}
            onPageChange={setPage}
          />
        )}
      </>
    );
  }

  return (
    <>
      <FilterTabs
        label="Filter by outcome"
        options={OUTCOMES}
        value={outcome}
        onChange={setOutcome}
      />
      {body}
    </>
  );
}
