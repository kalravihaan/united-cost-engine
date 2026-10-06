import { handle, readJson } from "@/server/http";
import { startCostingFromTemplate } from "@/services/costingService";

export const POST = handle(async (req, _ctx, user) => {
  const b = await readJson<{ styleId: string; type: "ACTUAL" | "CLIENT"; templateStyleId: string; mode: "STRUCTURE" | "VALUES" }>(req);
  if (b.type !== "ACTUAL" && b.type !== "CLIENT") throw new Error("Invalid costing type");
  const r = await startCostingFromTemplate({ ...b, mode: b.mode === "VALUES" ? "VALUES" : "STRUCTURE", user });
  return { version: r.version };
});
