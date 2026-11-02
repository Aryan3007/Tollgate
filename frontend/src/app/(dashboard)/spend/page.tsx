import { PageHeader } from "@/components/layout/page-header";
import { SpendOverview } from "@/features/spend/components/spend-overview";

export default function SpendPage() {
  return (
    <>
      <PageHeader
        title="Spend"
        description="Month-to-date cost across every team, in ₹. Months reset at 00:00 UTC on the 1st."
      />
      <SpendOverview />
    </>
  );
}
