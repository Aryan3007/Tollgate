import { ListTree } from "lucide-react";
import { Panel } from "@/components/data/panel";
import { PageHeader } from "@/components/layout/page-header";
import { RequestsTable } from "@/features/request-feed/components/requests-table";

export default function RequestsPage() {
  return (
    <>
      <PageHeader
        title="Requests"
        description="Every call through the gateway, with provider, latency, cost and outcome. Refreshes every few seconds."
      />
      <Panel title="Request log" icon={ListTree} flush>
        <RequestsTable />
      </Panel>
    </>
  );
}
