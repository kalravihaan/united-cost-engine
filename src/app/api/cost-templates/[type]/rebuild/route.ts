import { handle, HttpError, readFile } from "@/server/http";
import { rebuildTemplateFromReference } from "@/services/templateService";

/** POST ?format=KEY&label=Name  (client costing: learn one customer layout from a reference workbook) */
export const POST = handle<{ type: string }>(async (req, { params }, user) => {
  const u = params.type.toUpperCase();
  if (u !== "ACTUAL" && u !== "CLIENT") throw new HttpError(404, "Unknown costing type");
  const q = new URL(req.url).searchParams;
  const key = q.get("format")?.trim();
  if (key && !/^[A-Za-z0-9_-]{1,40}$/.test(key)) throw new HttpError(400, "Format key: letters, digits, - and _ only");
  const { bytes, name } = await readFile(req, 40_000_000);
  if (bytes.subarray(0, 2).toString("latin1") !== "PK") throw new HttpError(400, "Not an .xlsx workbook");
  return rebuildTemplateFromReference(u, bytes, name, user, key ? { key, label: q.get("label") ?? undefined } : null);
});
