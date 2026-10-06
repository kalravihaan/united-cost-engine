import { handle, readJson } from "@/server/http";
import { updateStyleMapping } from "@/services/styleService";

export const PATCH = handle<{ id: string }>(async (req, { params }, user) => {
  const b = await readJson<{ customerId?: string | null; brandId?: string | null; categoryId?: string | null }>(req);
  const s = await updateStyleMapping({ styleId: params.id, customerId: b.customerId, brandId: b.brandId, categoryId: b.categoryId, user });
  return { id: s.id };
});
