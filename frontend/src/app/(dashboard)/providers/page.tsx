import { PageHeader } from "@/components/layout/page-header";
import { ProviderGrid } from "@/features/providers/components/provider-grid";

export default function ProvidersPage() {
  return (
    <>
      <PageHeader
        title="Providers"
        description="Circuit-breaker state, error rate and latency for each upstream. Refreshes every few seconds."
      />
      <ProviderGrid />
    </>
  );
}
