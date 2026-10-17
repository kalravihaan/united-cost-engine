/**
 * Builds the first-run data of the single-file build (gen/seed.json): editable rules + the default costing templates
 * (one Actual, one Client per customer layout), learnt from the reference workbooks. Same steps as `npm run db:seed`,
 * run against the in-memory store. No styles, costings or customers; the Fabric / Rate masters hold the analysis's standards.
 */
import fs from "node:fs";
import path from "node:path";
import { rebuildTemplateFromReference } from "@/services/templateService";
import { seedDefaultRules } from "@/services/rulesService";
import { loadStandardRates } from "@/services/standardRatesService";
import { memdb } from "./shims/db";
import { blobs } from "./shims/fileStore";

(async () => {
  const dir = path.resolve("data/reference");
  const user = "Costing Desk";
  await seedDefaultRules();
  const jobs = [
    { type: "ACTUAL", file: "actual_costing.xlsx", format: null, extra: ["actual_costing_2.xlsx"] },
    { type: "CLIENT", file: "client_costing.xlsx", format: null, extra: [] },
    { type: "CLIENT", file: "client_costing_YOUSTA.xlsx", format: { key: "YOUSTA", label: "YOUSTA" }, extra: ["client_costing_YOUSTA_2243.xlsx"] },
  ] as const;
  for (const j of jobs) {
    const r = await rebuildTemplateFromReference(j.type, fs.readFileSync(path.join(dir, j.file)) as never, j.file, user, j.format, j.extra.map((f) => ({ bytes: fs.readFileSync(path.join(dir, f)) as never, fileName: f })));
    console.log(`${j.type} ${r.format}: ${r.lines} rows`);
  }
  console.log("standard rates:", JSON.stringify(await loadStandardRates(user)));
  const out = { format: "uce-data", version: 1, savedAt: new Date().toISOString(), db: memdb.snapshot(), blobs: Object.fromEntries([...blobs].map(([k, v]) => [k, Buffer.from(v).toString("base64")])) };
  fs.writeFileSync(path.resolve("standalone/gen/seed.json"), JSON.stringify(out));
  console.log("seed.json written");
})();
