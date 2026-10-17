import { Suspense } from "react";
import { MastersPage } from "@/features/masters/MastersPage";

export default function Page() {
  return (
    <Suspense>
      <MastersPage />
    </Suspense>
  );
}
