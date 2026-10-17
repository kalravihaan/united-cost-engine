"use client";
import "./polyfills";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "@/components/app-shell";
import { CostEnginePage } from "@/features/costing/CostEnginePage";
import { StylesPage } from "@/features/styles/StylesPage";
import { TemplatesPage } from "@/features/templates/TemplatesPage";
import { TemplateEditor } from "@/features/templates/TemplateEditor";
import { AnalysisPage } from "@/features/analysis/AnalysisPage";
import { MastersPage } from "@/features/masters/MastersPage";
import { usePathname, useSearchParams } from "next/navigation";
import { installServer } from "./runtime";
import { applyPayload, loadAutosave, startAutosave, type Payload } from "./persist";
import { DataBar } from "./DataBar";
import SEED from "./gen/seed.json";

function Router() {
  const path = usePathname();
  const sp = useSearchParams();
  if (path === "/styles") return <StylesPage />;
  if (path === "/analysis") return <AnalysisPage />;
  if (path === "/masters") return <MastersPage />;
  if (path === "/templates") return <TemplatesPage />;
  const t = path.match(/^\/templates\/(ACTUAL|CLIENT)$/i);
  if (t) return <TemplateEditor key={t[1] + (sp.get("format") ?? "")} type={t[1].toUpperCase() === "ACTUAL" ? "ACTUAL" : "CLIENT"} format={sp.get("format") ?? undefined} />;
  return <CostEnginePage />;
}

function App() {
  const [rev, setRev] = React.useState(0);
  return (
    <>
      <AppShell key={rev}>
        <React.Suspense>
          <Router />
        </React.Suspense>
      </AppShell>
      <DataBar seed={SEED as unknown as Payload} onReloaded={() => setRev((r) => r + 1)} />
    </>
  );
}

// In the Claude artifact viewer downloads go through its save prompt instead of the browser's
function hookArtifactDownloads() {
  const w = window as unknown as { claude?: { use?: (n: string) => Promise<{ save: (o: { filename: string; data: Blob }) => Promise<unknown> } | null> } };
  if (!w.claude?.use) return;
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.download && this.href.startsWith("blob:")) {
      const name = this.download;
      fetch(this.href).then((r) => r.blob()).then(async (b) => (await w.claude!.use!("downloads"))?.save({ filename: name, data: b })).catch(() => click.call(this));
      return;
    }
    click.call(this);
  };
}

async function boot() {
  installServer();
  hookArtifactDownloads();
  const saved = await loadAutosave();
  try {
    applyPayload(saved ?? (SEED as unknown as Payload));
  } catch {
    applyPayload(SEED as unknown as Payload);
  }
  startAutosave();
  document.title = "Cost Engine · United Textile Mills";
  createRoot(document.getElementById("root")!).render(<App />);
}
boot();
