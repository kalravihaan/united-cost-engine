import { matchStyle, type StyleCandidate } from "@/lib/normalization/styleMatching";
import { styleRepository } from "@/server/repositories/styles";
import { auditRepository } from "@/server/repositories/audit";
import { prisma } from "@/server/db";

export async function candidates(): Promise<StyleCandidate[]> {
  const rows = await styleRepository.matchCandidates();
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    names: [r.description, r.color ? `${r.number} - ${r.color}` : null].filter((x): x is string => !!x),
    confirmedAliases: r.aliases.map((a) => a.alias),
  }));
}

export async function matchStyleNumber(q: string) {
  return matchStyle(q, await candidates());
}

export async function createStyle(args: { number: string; customerId?: string | null; brandId?: string | null; categoryId?: string | null; user: string }) {
  const number = args.number.trim().replace(/^#/, "");
  if (!number) throw new Error("Style number is required");
  const existing = await styleRepository.byNumber(number);
  if (existing) throw new Error(`Style ${number} already exists`);
  const s = await styleRepository.create({ number, customerId: args.customerId ?? null, brandId: args.brandId ?? null, categoryId: args.categoryId ?? null });
  await auditRepository.log({ userName: args.user, action: "STYLE_CREATE", entityType: "Style", entityId: s.id, styleId: s.id, details: { number } });
  return s;
}

export async function updateStyleMapping(args: { styleId: string; customerId?: string | null; brandId?: string | null; categoryId?: string | null; user: string }) {
  if (args.brandId) {
    const brand = await prisma.brand.findUnique({ where: { id: args.brandId } });
    const customerId = args.customerId === undefined ? (await prisma.style.findUnique({ where: { id: args.styleId } }))?.customerId : args.customerId;
    if (brand && customerId && brand.customerId !== customerId) throw new Error("The selected brand does not belong to the selected customer.");
  }
  const s = await styleRepository.update(args.styleId, { customerId: args.customerId, brandId: args.brandId, categoryId: args.categoryId });
  await auditRepository.log({ userName: args.user, action: "STYLE_MAPPING", entityType: "Style", entityId: args.styleId, styleId: args.styleId, details: { customerId: args.customerId, brandId: args.brandId, categoryId: args.categoryId } });
  return s;
}

export async function confirmAlias(args: { styleId: string; alias: string; source?: string; user: string }) {
  const a = await styleRepository.addAlias(args.styleId, args.alias.trim(), args.source ?? "confirmed in UI", args.user);
  await auditRepository.log({ userName: args.user, action: "STYLE_ALIAS_CONFIRMED", entityType: "StyleAlias", entityId: a.id, styleId: args.styleId, details: { alias: args.alias } });
  return a;
}
