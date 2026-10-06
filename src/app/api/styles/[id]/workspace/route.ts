import { handle, HttpError } from "@/server/http";
import { getWorkspace } from "@/services/costingService";

export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const w = await getWorkspace(params.id);
  if (!w) throw new HttpError(404, "Style not found");
  return w;
});
