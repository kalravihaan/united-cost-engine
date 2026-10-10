import { matchStyle, type StyleCandidate } from "@/lib/normalization/styleMatching";
import { styleRepository } from "@/server/repositories/styles";
import { auditRepository } from "@/server/repositories/audit";
import { prisma } from "@/server/db";
import { fileStore } from "@/server/fileStore";

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

export interface StyleImpact {
  id: string;
  number: string;
  costings: Array<{ type: string; versions: number }>;
  cadRuns: number;
  files: number;
  aliases: number;
  auditEvents: number;
}

/** What deleting a style would remove (shown before the user confirms). */
export async function styleImpact(styleId: string): Promise<StyleImpact> {
  const s = await prisma.style.findUnique({ where: { id: styleId }, include: { costings: true } });
  if (!s) throw new Error("Style not found");
  const where = { styleId };
  return {
    id: s.id,
    number: s.number,
    costings: await Promise.all(s.costings.map(async (c) => ({ type: c.type, versions: await prisma.costingVersion.count({ where: { costingId: c.id } }) }))),
    cadRuns: await prisma.cadExtraction.count({ where }),
    files: await prisma.storedFile.count({ where }),
    aliases: await prisma.styleAlias.count({ where }),
    auditEvents: await prisma.auditEvent.count({ where }),
  };
}

/**
 * Permanently delete a style with its costings and every saved version, CAD extractions, uploaded files and confirmed aliases.
 * The audit trail is kept: the style's earlier events stay (detached from the style, with its number added) and a STYLE_DELETE event records what was removed.
 */
export async function deleteStyle(args: { styleId: string; user: string }) {
  const impact = await styleImpact(args.styleId);
  const files = await prisma.storedFile.findMany({ where: { styleId: args.styleId } });
  const events = await prisma.auditEvent.findMany({ where: { styleId: args.styleId } });

  await prisma.$transaction(async (tx) => {
    const costings = await tx.costing.findMany({ where: { styleId: args.styleId }, select: { id: true } });
    await tx.costingVersion.deleteMany({ where: { costingId: { in: costings.map((c) => c.id) } } });
    await tx.costing.deleteMany({ where: { styleId: args.styleId } });
    await tx.cadExtraction.deleteMany({ where: { styleId: args.styleId } });
    await tx.storedFile.deleteMany({ where: { styleId: args.styleId } });
    for (const e of events) {
      const details = e.details && typeof e.details === "object" && !Array.isArray(e.details) ? (e.details as Record<string, unknown>) : { value: e.details };
      await tx.auditEvent.update({ where: { id: e.id }, data: { styleId: null, details: { ...details, styleNumber: impact.number } } });
    }
    await tx.style.delete({ where: { id: args.styleId } }); // aliases cascade
    await auditRepository.log({ userName: args.user, action: "STYLE_DELETE", entityType: "Style", entityId: args.styleId, details: { number: impact.number, removed: impact } }, tx);
  });

  // uploaded bytes go last, and only when no other record still points at the same path
  for (const f of files) {
    if ((await prisma.storedFile.count({ where: { storagePath: f.storagePath } })) === 0) await fileStore().remove(f.storagePath).catch(() => undefined);
  }
  return impact;
}
