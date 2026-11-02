"use client";

import { KeyRound } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
import { FilterTabs } from "@/components/data/filter-tabs";
import { ErrorState } from "@/components/data/error-state";
import { Pagination } from "@/components/data/pagination";
import { TableSkeleton } from "@/components/data/table-skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiErrorOf } from "@/lib/api/client";
import { formatCount, formatDateTime, formatInr } from "@/lib/format";
import { useKeys } from "../hooks/use-keys";
import { KEY_STATUSES, type KeyStatus } from "../schemas/key";
import { useKeysUiStore } from "../store/keys-ui-store";
import { KeyStatusBadge } from "./key-status-badge";

const PAGE_SIZE = 20;
const COLUMNS = [
  "Key",
  "Team",
  "Models",
  "Status",
  "Requests",
  "Spend",
  "Last used",
  "",
];
const NUMERIC = new Set(["Requests", "Spend"]);
const cell = "px-4 py-4 sm:px-6";

const FILTERS: Array<{ value: KeyStatus | undefined; label: string }> = [
  { value: undefined, label: "All" },
  ...KEY_STATUSES.map((value) => ({
    value,
    label: value[0]!.toUpperCase() + value.slice(1),
  })),
];

function StatusFilter() {
  const status = useKeysUiStore((s) => s.status);
  const setStatus = useKeysUiStore((s) => s.setStatus);
  return <FilterTabs label="Filter by status" options={FILTERS} value={status} onChange={setStatus} />;
}

function Models({ models }: { models: string[] }) {
  const shown = models.slice(0, 2);
  const rest = models.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((model) => (
        <span
          key={model}
          className="rounded-md bg-muted px-2 py-0.5 font-mono text-[13px]"
        >
          {model}
        </span>
      ))}
      {rest > 0 && (
        <span
          className="rounded-md bg-muted px-2 py-0.5 text-[13px] text-muted-foreground"
          title={models.slice(2).join(", ")}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

export function KeysTable() {
  const page = useKeysUiStore((s) => s.page);
  const status = useKeysUiStore((s) => s.status);
  const setPage = useKeysUiStore((s) => s.setPage);
  const setCreateOpen = useKeysUiStore((s) => s.setCreateOpen);
  const setRevokeTarget = useKeysUiStore((s) => s.setRevokeTarget);
  const setSelectedKeyId = useKeysUiStore((s) => s.setSelectedKeyId);
  const keys = useKeys({ page, limit: PAGE_SIZE, status });

  let body;
  if (keys.isError) {
    body = (
      <ErrorState
        error={apiErrorOf(keys.error)}
        onRetry={() => keys.refetch()}
      />
    );
  } else if (keys.isSuccess && keys.data.total === 0) {
    body = status ? (
      <EmptyState
        icon={KeyRound}
        title={`No ${status} keys`}
        description="Keys with this status will show up here."
      />
    ) : (
      <EmptyState
        icon={KeyRound}
        title="No virtual keys"
        description="Create a key for a team, choose which models it can call, and hand it to an app. The full key is shown once."
        action={
          <Button
            size="lg"
            className="px-4"
            onClick={() => setCreateOpen(true)}
          >
            Create a virtual key
          </Button>
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
                {COLUMNS.map((column, index) => (
                  <TableHead
                    key={index}
                    className={`${cell} h-11 text-sm font-medium text-muted-foreground ${NUMERIC.has(column) ? "text-right" : ""}`}
                  >
                    {NUMERIC.has(column) && (
                      <span className="sr-only">This month: </span>
                    )}
                    {column || <span className="sr-only">Actions</span>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            {keys.isPending ? (
              <TableSkeleton columns={COLUMNS.length} />
            ) : (
              <TableBody>
                {keys.data.data.map((key) => (
                  <TableRow key={key.id} className="text-[15px]">
                    <TableCell className={cell}>
                      <button
                        type="button"
                        onClick={() => setSelectedKeyId(key.id)}
                        className="rounded font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {key.name}
                      </button>
                      <p className="font-mono text-[13px] text-muted-foreground">
                        {key.prefix}…
                      </p>
                    </TableCell>
                    <TableCell className={cell}>{key.teamName}</TableCell>
                    <TableCell className={cell}>
                      <Models models={key.allowedModels} />
                    </TableCell>
                    <TableCell className={cell}>
                      <KeyStatusBadge status={key.status} />
                    </TableCell>
                    <TableCell
                      className={`${cell} text-right font-mono tabular-nums`}
                    >
                      {formatCount(key.usage.requests)}
                    </TableCell>
                    <TableCell
                      className={`${cell} text-right font-mono tabular-nums`}
                    >
                      {formatInr(key.usage.costMicroInr)}
                    </TableCell>
                    <TableCell className={`${cell} text-muted-foreground`}>
                      {key.lastUsedAt
                        ? formatDateTime(key.lastUsedAt)
                        : "Never"}
                    </TableCell>
                    <TableCell className={`${cell} text-right`}>
                      {key.status !== "revoked" && (
                        <Button
                          variant="ghost"
                          className="text-destructive hover:bg-danger hover:text-danger-foreground"
                          onClick={() => setRevokeTarget(key)}
                          aria-label={`Revoke ${key.name}`}
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
        {keys.isSuccess && (
          <Pagination
            page={page}
            limit={PAGE_SIZE}
            total={keys.data.total}
            onPageChange={setPage}
          />
        )}
      </>
    );
  }

  return (
    <>
      <StatusFilter />
      {body}
    </>
  );
}
