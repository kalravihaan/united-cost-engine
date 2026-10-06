import { handle, HttpError, readFile } from "@/server/http";
import { rebuildTemplateFromReference } from "@/services/templateService";

export const POST = handle<{ type: string }>(async (req, { params }, user) => {
  const u = params.type.toUpperCase();
  if (u !== "ACTUAL" && u !== "CLIENT") throw new HttpError(404, "Unknown costing type");
  const { bytes, name } = await readFile(req, 40_000_000);
  if (bytes.subarray(0, 2).toString("latin1") !== "PK") throw new HttpError(400, "Not an .xlsx workbook");
  return rebuildTemplateFromReference(u, bytes, name, user);
});
