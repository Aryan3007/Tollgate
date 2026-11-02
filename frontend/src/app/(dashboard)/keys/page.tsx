import { ListChecks } from "lucide-react";
import { Suspense } from "react";
import { Panel } from "@/components/data/panel";
import { PageHeader } from "@/components/layout/page-header";
import { CreateKeyDrawer } from "@/features/keys/components/create-key-drawer";
import { KeyDetailDrawer } from "@/features/keys/components/key-detail-drawer";
import { KeysTable } from "@/features/keys/components/keys-table";
import { NewKeyButton } from "@/features/keys/components/new-key-button";
import { RevokeKeyDialog } from "@/features/keys/components/revoke-key-dialog";

export default function KeysPage() {
  return (
    <>
      <PageHeader
        title="Virtual keys"
        description="Scoped keys your apps use instead of real provider keys."
        actions={
          <Suspense>
            <NewKeyButton />
          </Suspense>
        }
      />
      <RevokeKeyDialog />
      <Panel title="All keys" icon={ListChecks} flush>
        <KeysTable />
      </Panel>
      <CreateKeyDrawer />
      <KeyDetailDrawer />
    </>
  );
}
