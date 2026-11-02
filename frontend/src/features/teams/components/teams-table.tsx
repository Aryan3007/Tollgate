"use client";

import { Users } from "lucide-react";
import { EmptyState } from "@/components/data/empty-state";
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
import { formatCount, formatDate, formatInr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTeams } from "../hooks/use-teams";
import { PII_TYPES, type Team } from "../schemas/team";
import { useTeamsUiStore } from "../store/teams-ui-store";

const PAGE_SIZE = 20;
const COLUMNS = [
  "Team",
  "Spent this month",
  "PII masking",
  "Answer cache",
  "Requests / min",
  "Tokens / min",
  "Default max tokens",
  "Created",
  "",
];
const NUMERIC = new Set([
  "Requests / min",
  "Tokens / min",
  "Default max tokens",
]);
const cell = "px-4 py-4 sm:px-6";
const numeric = `${cell} text-right font-mono tabular-nums`;

function BudgetUsage({ team }: { team: Team }) {
  const spent = team.usage.costMicroInr;
  const budget = team.monthlyBudgetMicroInr;
  const percent =
    budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 100;

  return (
    <div className="flex min-w-48 flex-col gap-1.5">
      <p className="font-mono text-sm tabular-nums">
        {formatInr(spent)}{" "}
        <span className="text-muted-foreground">of {formatInr(budget)}</span>
      </p>
      <div
        role="progressbar"
        aria-label={`${team.name} budget used`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full",
            percent >= 100
              ? "bg-danger-foreground"
              : percent >= 80
                ? "bg-warning-foreground"
                : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function TeamsTable() {
  const page = useTeamsUiStore((s) => s.page);
  const setPage = useTeamsUiStore((s) => s.setPage);
  const openCreate = useTeamsUiStore((s) => s.openCreate);
  const openEdit = useTeamsUiStore((s) => s.openEdit);
  const teams = useTeams({ page, limit: PAGE_SIZE });

  if (teams.isError) {
    return (
      <ErrorState
        error={apiErrorOf(teams.error)}
        onRetry={() => teams.refetch()}
      />
    );
  }

  if (teams.isSuccess && teams.data.total === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No teams yet"
        description="Each team gets a monthly budget in ₹, its own rate limits, and the virtual keys its apps use."
        action={
          <Button size="lg" className="px-4" onClick={openCreate}>
            Create a team
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table className="min-w-[1120px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {COLUMNS.map((column) => (
                <TableHead
                  key={column}
                  className={`${cell} h-11 text-sm font-medium text-muted-foreground ${NUMERIC.has(column) ? "text-right" : ""}`}
                >
                  {column || <span className="sr-only">Actions</span>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {teams.isPending ? (
            <TableSkeleton columns={COLUMNS.length} />
          ) : (
            <TableBody>
              {teams.data.data.map((team) => (
                <TableRow key={team.id} className="text-[15px]">
                  <TableCell className={`${cell} font-medium`}>
                    <button
                      type="button"
                      onClick={() => openEdit(team)}
                      className="rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {team.name}
                    </button>
                  </TableCell>
                  <TableCell className={cell}>
                    <BudgetUsage team={team} />
                  </TableCell>
                  <TableCell className={cell}>
                    {team.piiEntities.length === 0 ? (
                      <span className="text-muted-foreground">Off</span>
                    ) : (
                      <span title={team.piiEntities.join(", ")}>
                        {team.piiEntities.length === PII_TYPES.length
                          ? "All types"
                          : `${team.piiEntities.length} of ${PII_TYPES.length} types`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={cell}>
                    {team.cacheEnabled ? (
                      `Up to temp ${team.cacheMaxTemperature}`
                    ) : (
                      <span className="text-muted-foreground">Off</span>
                    )}
                  </TableCell>
                  <TableCell className={numeric}>
                    {formatCount(team.rpmLimit)}
                  </TableCell>
                  <TableCell className={numeric}>
                    {formatCount(team.tpmLimit)}
                  </TableCell>
                  <TableCell className={numeric}>
                    {formatCount(team.defaultMaxTokens)}
                  </TableCell>
                  <TableCell className={`${cell} text-muted-foreground`}>
                    {formatDate(team.createdAt)}
                  </TableCell>
                  <TableCell className={`${cell} text-right`}>
                    <Button
                      variant="ghost"
                      onClick={() => openEdit(team)}
                      aria-label={`Edit ${team.name}`}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      </div>
      {teams.isSuccess && (
        <Pagination
          page={page}
          limit={PAGE_SIZE}
          total={teams.data.total}
          onPageChange={setPage}
        />
      )}
    </>
  );
}
