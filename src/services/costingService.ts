import type { CadData, CostingDoc, CostingResult } from "@/types/costing";
import { calculateCosting, ENGINE_VERSION, headline } from "@/lib/calculations";
import { diffCostings } from "@/lib/calculations/diff";
import { createFromTemplate } from "@/lib/calculations/template";
import { costingDocSchema } from "@/lib/validation/schema";
import { prisma } from "@/server/db";
import { costingRepository } from "@/server/repositories/costings";
import { auditRepository } from "@/server/repositories/audit";
import { cadRepository, fileRepository } from "@/server/repositories/files";

export interface VersionPayload {
  id: string;
  versionNo: number;
  sourceKind: string;
  sourceFile: string | null;
  sourceSheet: string | null;
  createdBy: string;
  createdAt: string;
  note: string | null;
  doc: CostingDoc;
  result: CostingResult;
  engineVersion: string;
}

function payload(v: NonNullable<Awaited<ReturnType<typeof costingRepository.latest>>>): VersionPayload {
  return {
    id: v.id,
    versionNo: v.versionNo,
    sourceKind: v.sourceKind,
    sourceFile: v.sourceFile,
    sourceSheet: v.sourceSheet,
    createdBy: v.createdBy,
    createdAt: v.createdAt.toISOString(),
    note: v.note,
    doc: v.doc as unknown as CostingDoc,
    result: v.result as unknown as CostingResult,
    engineVersion: v.engineVersion,
  };
}

/** Everything the main screen needs for one style, in one call. */
export async function getWorkspace(styleId: string) {
  const style = await prisma.style.findUnique({
    where: { id: styleId },
    include: { customer: { include: { clientFormat: true } }, brand: { include: { clientFormat: true } }, category: true, aliases: true },
  });
  if (!style) return null;
  const [actual, client, cad, image, cadFile] = await Promise.all([
    costingRepository.latest(styleId, "ACTUAL"),
    costingRepository.latest(styleId, "CLIENT"),
    cadRepository.latestForStyle(styleId),
    style.imageFileId ? fileRepository.byId(style.imageFileId) : null,
    fileRepository.listForStyle(styleId, "CAD_PDF").then((f) => f[0] ?? null),
  ]);
  const preview = cadFile ? (await fileRepository.listForStyle(styleId, "CAD_PREVIEW"))[0] ?? null : null;
  return {
    style: {
      id: style.id,
      number: style.number,
      color: style.color,
      description: style.description,
      customerId: style.customerId,
      brandId: style.brandId,
      categoryId: style.categoryId,
      customer: style.customer?.name ?? null,
      brand: style.brand?.name ?? null,
      category: style.category?.name ?? null,
      /** client-costing layout of the style's brand (else customer); null = the default layout */
      clientFormat: (style.brand?.clientFormat ?? style.customer?.clientFormat)?.key ?? null,
      aliases: style.aliases.map((a) => a.alias),
    },
    imageUrl: image ? `/api/files/${image.id}` : null,
    cadFileUrl: cadFile ? `/api/files/${cadFile.id}` : null,
    cadPreviewUrl: preview ? `/api/files/${preview.id}` : null,
    cad: cad ? { id: cad.id, revision: cad.revision, data: cad.data as unknown as CadData, createdAt: cad.createdAt.toISOString(), createdBy: cad.createdBy } : null,
    actual: actual ? payload(actual) : null,
    client: client ? payload(client) : null,
  };
}

export async function saveCostingVersion(args: { styleId: string; doc: unknown; note?: string | null; user: string; sourceKind?: "MANUAL" | "TEMPLATE" }) {
  const parsed = costingDocSchema.safeParse(args.doc);
  if (!parsed.success) throw new Error(`Invalid costing document: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const doc = parsed.data as unknown as CostingDoc;
  const style = await prisma.style.findUnique({ where: { id: args.styleId } });
  if (!style) throw new Error("Style not found");
  const result = calculateCosting(doc);
  const prev = await costingRepository.latest(args.styleId, doc.type);
  const changed = diffCostings(prev ? (prev.doc as unknown as CostingDoc) : null, doc);
  if (prev && changed.length === 0) return { unchanged: true as const, version: payload(prev) };
  const v = await prisma.$transaction(async (tx) => {
    const created = await costingRepository.appendVersion(tx, {
      styleId: args.styleId,
      type: doc.type,
      doc,
      result,
      engineVersion: ENGINE_VERSION,
      headline: headline(doc, result),
      changedFields: changed,
      sourceKind: args.sourceKind ?? "MANUAL",
      sourceFile: doc.source?.file ?? null,
      sourceSheet: doc.source?.sheet ?? null,
      note: args.note ?? null,
      createdBy: args.user,
    });
    await auditRepository.log(
      {
        userName: args.user,
        action: "SAVE_VERSION",
        entityType: "CostingVersion",
        entityId: created.id,
        styleId: args.styleId,
        costingVersionId: created.id,
        details: { type: doc.type, versionNo: created.versionNo, changedFields: changed.length, overrides: doc.lines.filter((l) => Object.values(l.prov).some((p) => (p as { origin?: string })?.origin === "OVERRIDE")).length, cadApplied: doc.cadApplied ?? null },
      },
      tx,
    );
    return created;
  });
  return { unchanged: false as const, version: payload(v) };
}

export async function startCostingFromTemplate(args: { styleId: string; type: "ACTUAL" | "CLIENT"; templateStyleId: string; mode: "STRUCTURE" | "VALUES"; user: string }) {
  const style = await prisma.style.findUnique({ where: { id: args.styleId } });
  if (!style) throw new Error("Style not found");
  const existing = await costingRepository.latest(args.styleId, args.type);
  if (existing) throw new Error(`Style ${style.number} already has a ${args.type} costing (v${existing.versionNo}).`);
  const template = await costingRepository.latest(args.templateStyleId, args.type);
  if (!template) throw new Error("The template style has no costing of this type.");
  const doc = createFromTemplate(template.doc as unknown as CostingDoc, { number: style.number, color: style.color ?? undefined }, args.mode);
  return saveCostingVersion({ styleId: args.styleId, doc, note: `Started from template (${args.mode === "VALUES" ? "values copied" : "structure only"})`, user: args.user, sourceKind: "TEMPLATE" });
}

export async function listVersions(styleId: string, type: "ACTUAL" | "CLIENT") {
  const rows = await costingRepository.versions(styleId, type);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function getVersion(id: string) {
  const v = await costingRepository.byId(id);
  if (!v) return null;
  return { styleId: v.costing.styleId, styleNumber: v.costing.style.number, type: v.costing.type, ...payload(v) };
}

/** Templates offered when a style has no costing of this type: every style that has one. */
export async function listTemplates(type: "ACTUAL" | "CLIENT") {
  const rows = await prisma.costing.findMany({ where: { type }, include: { style: true, versions: { orderBy: { versionNo: "desc" }, take: 1, select: { versionNo: true, costPerPc: true } } }, orderBy: { style: { number: "asc" } } });
  return rows.map((c) => ({ styleId: c.styleId, styleNumber: c.style.number, color: c.style.color, versionNo: c.versions[0]?.versionNo ?? 0, costPerPc: c.versions[0]?.costPerPc ?? null }));
}
