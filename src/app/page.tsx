import { Suspense } from "react";
import { CostEnginePage } from "@/features/costing/CostEnginePage";

export default function Page() {
  return (
    <Suspense>
      <CostEnginePage />
    </Suspense>
  );
}
