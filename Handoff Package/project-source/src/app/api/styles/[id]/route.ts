import { handle, readJson } from "@/server/http";
import { deleteStyle, styleImpact, updateStyleMapping } from "@/services/styleService";

export const PATCH = handle<{ id: string }>(async (req, { params }, user) => {
  const b = await readJson<{ customerId?: string | null; brandId?: string | null; categoryId?: string | null }>(req);
  const s = await updateStyleMapping({ styleId: params.id, customerId: b.customerId, brandId: b.brandId, categoryId: b.categoryId, user });
  return { id: s.id };
});

/** What deleting the style would remove. */
export const GET = handle<{ id: string }>(async (_req, { params }) => styleImpact(params.id));

/** Permanently delete the style, its costings (all versions), CAD runs and uploads. Needs ?confirm=<style number>. */
export const DELETE = handle<{ id: string }>(async (req, { params }, user) => {
  const impact = await styleImpact(params.id);
  if (new URL(req.url).searchParams.get("confirm") !== impact.number) throw new Error("Confirm by sending the style number");
  return deleteStyle({ styleId: params.id, user });
});
