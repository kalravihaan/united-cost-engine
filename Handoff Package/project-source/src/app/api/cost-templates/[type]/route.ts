import { handle, HttpError, readJson } from "@/server/http";
import { getTemplate, saveTemplate } from "@/services/templateService";

const kind = (t: string) => {
  const u = t.toUpperCase();
  if (u !== "ACTUAL" && u !== "CLIENT") throw new HttpError(404, "Unknown costing type");
  return u as "ACTUAL" | "CLIENT";
};
const formatOf = (req: Request) => new URL(req.url).searchParams.get("format");

/** Default rows/headers for a costing mode. Client costing has one layout per customer/brand format (?format=KEY, default DEFAULT). */
export const GET = handle<{ type: string }>(async (req, { params }) => {
  const t = await getTemplate(kind(params.type), formatOf(req));
  if (!t) throw new HttpError(404, "No default template yet. Build it from a reference workbook (Templates).");
  return t;
});

export const PUT = handle<{ type: string }>(async (req, { params }, user) => saveTemplate(kind(params.type), (await readJson<{ doc: unknown }>(req)).doc, user, formatOf(req)));
