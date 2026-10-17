import { handle, readFile, readJson } from "@/server/http";
import { editCadField, uploadCad } from "@/services/cadService";

export const POST = handle<{ id: string }>(async (req, { params }, user) => {
  const { bytes, name } = await readFile(req, 30_000_000);
  return uploadCad({ styleId: params.id, bytes, fileName: name, user });
});

export const PATCH = handle<{ id: string }>(async (req, { params }, user) => {
  const b = await readJson<{ field: string; value: number | string | null; reason?: string }>(req);
  return editCadField({ styleId: params.id, field: b.field, value: b.value, reason: b.reason, user });
});
