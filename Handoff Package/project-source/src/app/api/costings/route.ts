import { handle, readJson } from "@/server/http";
import { saveCostingVersion } from "@/services/costingService";

/** Save = append a new immutable version. */
export const POST = handle(async (req, _ctx, user) => {
  const b = await readJson<{ styleId: string; doc: unknown; note?: string }>(req);
  const r = await saveCostingVersion({ styleId: b.styleId, doc: b.doc, note: b.note, user });
  return { unchanged: r.unchanged, version: r.version };
});
