import type { ClientFormat, CostingDoc } from "@/types/costing";
import { parseActualWorkbook } from "@/lib/parsers/actualCostingParser";
import { parseClientWorkbook } from "@/lib/parsers/clientCostingParser";
import { buildActualTemplate, buildClientTemplate, DEFAULT_CLIENT_FORMAT } from "@/lib/parsers/templateBuilder";
import { compactDoc } from "@/lib/calculations/sections";
import { costingDocSchema } from "@/lib/validation/schema";
import { uomDimension } from "@/lib/normalization/labels";
import { prisma } from "@/server/db";
import { fileStore } from "@/server/fileStore";
import { fileRepository } from "@/server/repositories/files";
import { auditRepository } from "@/server/repositories/audit";
import { DEFAULT_FORMAT, templateRepository } from "@/server/repositories/templates";

const formatKeyOf = (type: "ACTUAL" | "CLIENT", format?: string | null) => (type === "CLIENT" && format ? format.trim().toUpperCase() : DEFAULT_FORMAT);

export async function getTemplate(type: "ACTUAL" | "CLIENT", format?: string | null) {
  const key = formatKeyOf(type, format);
  const t = await templateRepository.get(type, key);
  if (!t) return null;
  return { type, format: key, version: t.version, doc: t.doc as unknown as CostingDoc, source: t.source, updatedBy: t.updatedBy, updatedAt: t.updatedAt.toISOString() };
}

/** Client layouts that have a stored template (+ their display label). */
export async function listClientFormats() {
  const [rows, formats] = await Promise.all([templateRepository.list("CLIENT"), prisma.clientFormat.findMany({ where: { active: true } })]);
  return rows.map((r) => {
    const doc = r.doc as unknown as CostingDoc;
    const f = formats.find((x) => x.key === r.formatKey);
    return { key: r.formatKey, label: f?.label ?? (doc.type === "CLIENT" ? doc.client.format?.label : undefined) ?? r.formatKey, version: r.version, lines: doc.lines.length, active: f ? f.active : true };
  });
}

export async function saveTemplate(type: "ACTUAL" | "CLIENT", input: unknown, user: string, format?: string | null) {
  const parsed = costingDocSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid template: ${parsed.error.issues[0]?.message ?? "bad shape"}`);
  const doc = parsed.data as unknown as CostingDoc;
  if (doc.type !== type) throw new Error("Template type mismatch");
  const clean = compactDoc(doc);
  // a template carries structure only: no quantities, rates, amounts or notes
  clean.lines = clean.lines.map((l) => ({ ...l, quantity: null, rate: l.calc === "PERCENT_OF_SUBTOTAL" && l.prov.rate?.origin === "TEMPLATE" ? l.rate : null, amount: l.calc === "ENTERED_AMOUNT" ? null : l.amount, description: "", attributes: {}, custom: false, removed: false }));
  const key = formatKeyOf(type, format);
  if (clean.type === "CLIENT") clean.client = { ...clean.client, format: { key, label: clean.client.format?.label ?? key } };
  const row = await templateRepository.save(type, clean, "edited in Masters", user, key);
  await auditRepository.log({ userName: user, action: "TEMPLATE_SAVE", entityType: "CostTemplate", entityId: row.id, details: { type, format: key, version: row.version, lines: clean.lines.length } });
  return getTemplate(type, key);
}

/**
 * Learn the structure (headers + rows) from a reference workbook and store it as the default template.
 * No costing values and no styles are imported.
 */
export async function rebuildTemplateFromReference(type: "ACTUAL" | "CLIENT", bytes: Buffer, fileName: string, user: string, format?: { key: string; label?: string } | null, extras: Array<{ bytes: Buffer; fileName: string }> = []) {
  const key = formatKeyOf(type, format?.key);
  const fmt: ClientFormat = key === DEFAULT_FORMAT ? { ...DEFAULT_CLIENT_FORMAT, ...(format?.label ? { label: format.label } : {}) } : { key, label: format?.label?.trim() || key };
  const put = await fileStore().put(bytes, { folder: "reference-workbooks", name: fileName });
  await fileRepository.create({ kind: "SOURCE_WORKBOOK", originalName: fileName, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: put.size, sha256: put.sha256, storagePath: put.storagePath, uploadedBy: user });
  let doc: CostingDoc;
  let categories: Array<{ name: string; rate: number; qty: number | null; source: string }> = [];
  let uoms: string[] = [];
  if (type === "ACTUAL") {
    const p = await parseActualWorkbook(bytes, fileName);
    if (!p.sheets.length) throw new Error("No usable worksheets found in the actual-costing reference workbook");
    // several reference workbooks can be learnt together; the template is the union of every row seen
    const more = [];
    for (const x of extras) more.push(await parseActualWorkbook(x.bytes, x.fileName));
    doc = buildActualTemplate([p, ...more], [fileName, ...extras.map((x) => x.fileName)].join(" + "));
  } else {
    const p = await parseClientWorkbook(bytes, fileName);
    if (!p.sheets.length) throw new Error(`No usable worksheet found: ${p.issues.map((i) => i.message).join("; ")}`);
    const more = [];
    for (const x of extras) more.push(...(await parseClientWorkbook(x.bytes, x.fileName)).sheets);
    doc = buildClientTemplate(p.sheets[0], fileName, fmt, more);
    categories = [p.sheets[0], ...more].flatMap((sh) => sh.overheadTiers.map((t) => ({ name: t.category.trim(), rate: t.rate, qty: t.qty, source: `${sh.doc.source?.file ?? fileName} → ${t.ref.sheet}!${t.ref.cell}` })));
    uoms = [...p.sheets[0].uomOptions, ...doc.lines.map((l) => l.uom).filter((u): u is string => !!u)];
  }
  const row = await templateRepository.save(type, doc, `reference: ${fileName}`, user, key);
  if (type === "CLIENT") await prisma.clientFormat.upsert({ where: { key }, create: { key, label: fmt.label }, update: { label: fmt.label } });
  for (const c of categories) await prisma.category.upsert({ where: { name: c.name }, create: { name: c.name, overheadMarginRate: c.rate, qty: c.qty, source: c.source }, update: {} });
  for (const u of new Set(uoms)) await prisma.uom.upsert({ where: { code: u }, create: { code: u, source: `reference: ${fileName}`, dimension: uomDimension(u) }, update: {} });
  for (const [i, s] of (doc.type === "CLIENT" ? doc.client.sections : []).entries()) {
    await prisma.costSection.upsert({ where: { costingType_key: { costingType: "CLIENT", key: s.key } }, create: { costingType: "CLIENT", key: s.key, label: s.label, phase: s.phase, sortOrder: i }, update: {} });
  }
  if (doc.type === "ACTUAL") {
    for (const [i, [key, label]] of ([["FABRIC_ORDER", "FABRIC ORDER"], ["CMT", "CMT"], ["TRIMS", "TRIMS"], ["LD_CHARGES", "LD CHARGES"], ["REJECT", "REJECT"]] as const).entries()) {
      await prisma.costSection.upsert({ where: { costingType_key: { costingType: "ACTUAL", key } }, create: { costingType: "ACTUAL", key, label, sortOrder: i }, update: {} });
    }
  }
  for (const l of doc.lines) {
    if (!l.item.trim()) continue;
    await prisma.costItem.upsert({ where: { costingType_sectionKey_name: { costingType: type, sectionKey: l.sectionKey, name: l.item.trim() } }, create: { costingType: type, sectionKey: l.sectionKey, name: l.item.trim(), defaultUom: l.uom, itemType: l.itemType, source: `reference: ${fileName}` }, update: {} });
  }
  await auditRepository.log({ userName: user, action: "TEMPLATE_REBUILD", entityType: "CostTemplate", entityId: row.id, details: { type, format: key, fileName, lines: doc.lines.length } });
  return { type, format: key, version: row.version, lines: doc.lines.length, sections: new Set(doc.lines.map((l) => l.sectionKey)).size };
}
