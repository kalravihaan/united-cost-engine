import { handle, HttpError } from "@/server/http";
import { getVersion } from "@/services/costingService";

export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const v = await getVersion(params.id);
  if (!v) throw new HttpError(404, "Version not found");
  return v;
});
