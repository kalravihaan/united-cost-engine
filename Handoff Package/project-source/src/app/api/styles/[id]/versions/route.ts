import { handle } from "@/server/http";
import { listVersions } from "@/services/costingService";

export const GET = handle<{ id: string }>(async (req, { params }) => {
  const type = new URL(req.url).searchParams.get("type") === "CLIENT" ? "CLIENT" : "ACTUAL";
  return listVersions(params.id, type);
});
