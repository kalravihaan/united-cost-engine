import { handle, readJson } from "@/server/http";
import { styleRepository } from "@/server/repositories/styles";
import { createStyle } from "@/services/styleService";

export const GET = handle(async (req) => {
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  const rows = await styleRepository.list({ q, take: 500 });
  return rows.map((s) => ({
    id: s.id,
    number: s.number,
    color: s.color,
    description: s.description,
    customer: s.customer?.name ?? null,
    brand: s.brand?.name ?? null,
    category: s.category?.name ?? null,
    customerId: s.customerId,
    brandId: s.brandId,
    categoryId: s.categoryId,
    costings: s.costings.map((c) => ({ type: c.type, versionNo: c.versions[0]?.versionNo ?? 0, costPerPc: c.versions[0]?.costPerPc ?? null, totalCost: c.versions[0]?.totalCost ?? null, sourceKind: c.versions[0]?.sourceKind ?? null })),
  }));
});

export const POST = handle(async (req, _ctx, user) => {
  const b = await readJson<{ number: string; customerId?: string | null; brandId?: string | null; categoryId?: string | null }>(req);
  const s = await createStyle({ number: b.number ?? "", customerId: b.customerId, brandId: b.brandId, categoryId: b.categoryId, user });
  return { id: s.id, number: s.number };
});
