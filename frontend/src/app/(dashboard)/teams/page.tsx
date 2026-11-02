import { SlidersHorizontal } from "lucide-react";
import { Panel } from "@/components/data/panel";
import { PageHeader } from "@/components/layout/page-header";
import { TeamDrawer } from "@/features/teams/components/team-drawer";
import { NewTeamButton } from "@/features/teams/components/new-team-button";
import { TeamsTable } from "@/features/teams/components/teams-table";

export default function TeamsPage() {
  return (
    <>
      <PageHeader
        title="Teams"
        description="Budgets, rate limits, PII rules and routing for each team."
        actions={<NewTeamButton />}
      />
      <Panel title="All teams" icon={SlidersHorizontal} flush>
        <TeamsTable />
      </Panel>
      <TeamDrawer />
    </>
  );
}
