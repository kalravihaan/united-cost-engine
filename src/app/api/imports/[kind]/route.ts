import { handle, HttpError, readFile } from "@/server/http";
import { importActualWorkbook, importClientWorkbook } from "@/services/importService";

export const POST = handle<{ kind: string }>(async (req, { params }, user) => {
  if (params.kind !== "actual" && params.kind !== "client") throw new HttpError(404, "Unknown import kind");
  const { bytes, name } = await readFile(req, 40_000_000);
  if (bytes.subarray(0, 2).toString("latin1") !== "PK") throw new HttpError(400, "Not an .xlsx workbook");
  return params.kind === "actual" ? importActualWorkbook(bytes, name, user) : importClientWorkbook(bytes, name, user);
});
