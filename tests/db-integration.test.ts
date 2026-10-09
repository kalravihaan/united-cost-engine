import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Database integration (templates, versioning, audit, CAD revisions).
 * Runs against TEST_DATABASE_URL (a disposable PostgreSQL database with the schema pushed); skipped when unset.
 */
const url = process.env.TEST_DATABASE_URL;
if (url && !/test/i.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test' (the suite truncates tables)");
const d = url ? describe : describe.skip;
const ref = (f: string) => fs.readFileSync(path.resolve(__dirname, "..", "data", "reference", f));

d("database: templates, versions, audit, CAD revisions", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.STORAGE_DIR = path.resolve(__dirname, "..", "storage-test");
    const { prisma } = await import("@/server/db");
    await prisma.$executeRawUnsafe(`TRUNCATE "AuditEvent","CadExtraction","CostingVersion","Costing","StoredFile","StyleAlias","Style","Category","Uom","CostSection","CostItem","FabricMaster","RateMaster","CostingRule","CostTemplate","Brand","Customer","ClientFormat" RESTART IDENTITY CASCADE`);
    const lib = await import("@/lib/calculations");
    m = {
      prisma,
      tpl: await import("@/services/templateService"),
      cost: await import("@/services/costingService"),
      cad: await import("@/services/cadService"),
      style: await import("@/services/styleService"),
      lib,
    };
  });
  afterAll(async () => {
    await m?.prisma.$disconnect();
    fs.rmSync(path.resolve(__dirname, "..", "storage-test"), { recursive: true, force: true });
  });

  it("builds the default templates from the reference workbooks without creating any style or costing", async () => {
    const a = await m.tpl.rebuildTemplateFromReference("ACTUAL", ref("actual_costing.xlsx"), "actual_costing.xlsx", "t");
    const c = await m.tpl.rebuildTemplateFromReference("CLIENT", ref("client_costing.xlsx"), "client_costing.xlsx", "t");
    expect(a.lines).toBe(40);
    expect(c.lines).toBe(34);
    expect(await m.prisma.style.count()).toBe(0);
    expect(await m.prisma.costingVersion.count()).toBe(0);
    expect(await m.prisma.category.count()).toBe(3);
    const t = await m.tpl.getTemplate("CLIENT");
    expect(t.doc.lines.every((l: { quantity: number | null; rate: number | null }) => l.quantity === null && l.rate === null)).toBe(true);
  });

  it("template edits are versioned and only affect new costings", async () => {
    const t = await m.tpl.getTemplate("CLIENT");
    const edited = m.lib.addClientSection(t.doc, "Washing");
    const saved = await m.tpl.saveTemplate("CLIENT", edited, "u");
    expect(saved.version).toBe(t.version + 1);
    expect(saved.doc.client.sections.map((s: { key: string }) => s.key)).toContain("washing");
    await expect(m.tpl.saveTemplate("ACTUAL", edited, "u")).rejects.toThrow(/mismatch/);
  });

  it("a new style's costing is entered in the engine and saved as an immutable version", async () => {
    const style = await m.style.createStyle({ number: "72232", user: "t" });
    const tpl = (await m.tpl.getTemplate("CLIENT")).doc;
    let doc = m.lib.createFromTemplate(tpl, { number: "72232" }, "STRUCTURE");
    const main = doc.lines.find((l: { item: string }) => l.item === "Main Fabric");
    doc = m.lib.setLineField(doc, main.id, "quantity", 0.77, { by: "u" });
    doc = m.lib.setLineField(doc, main.id, "rate", 80, { by: "u" });
    const v1 = await m.cost.saveCostingVersion({ styleId: style.id, doc, note: "first entry", user: "u" });
    expect(v1.version.versionNo).toBe(1);
    expect(v1.version.result.totalCost.base).toBeCloseTo(0.77 * 80, 10);

    const doc2 = m.lib.setLineField(v1.version.doc, main.id, "rate", 82, { by: "u", reason: "rate revision" });
    const v2 = await m.cost.saveCostingVersion({ styleId: style.id, doc: doc2, user: "u" });
    expect(v2.version.versionNo).toBe(2);
    const vs = await m.cost.listVersions(style.id, "CLIENT");
    expect(vs.map((v: { versionNo: number }) => v.versionNo)).toEqual([2, 1]);
    const old = await m.cost.getVersion(vs[1].id);
    expect(old.doc.lines.find((l: { id: string }) => l.id === main.id).rate).toBe(80);
    expect(vs[0].changedFields).toEqual([{ path: "Main Fabric.rate", before: 80, after: 82 }]);
    expect((await m.cost.saveCostingVersion({ styleId: style.id, doc: v2.version.doc, user: "u" })).unchanged).toBe(true);
    const audit = await m.prisma.auditEvent.findMany({ where: { styleId: style.id, action: "SAVE_VERSION" } });
    expect(audit).toHaveLength(2);
    await expect(m.cost.saveCostingVersion({ styleId: style.id, doc: { type: "CLIENT", lines: "x" }, user: "t" })).rejects.toThrow(/Invalid costing document/);
  });

  it("Actual and Client are separate costings of the same style", async () => {
    const s = await m.prisma.style.findUnique({ where: { number: "72232" } });
    const tpl = (await m.tpl.getTemplate("ACTUAL")).doc;
    const doc = m.lib.createFromTemplate(tpl, { number: "72232" }, "STRUCTURE");
    const v = await m.cost.saveCostingVersion({ styleId: s.id, doc, user: "u" });
    expect(v.version.versionNo).toBe(1);
    const w = await m.cost.getWorkspace(s.id);
    expect(w.actual.doc.type).toBe("ACTUAL");
    expect(w.client.doc.type).toBe("CLIENT");
    expect(w.client.versionNo).toBe(2);
  });

  it("CAD upload extracts values; edits create new revisions and keep the extracted value", async () => {
    const style = await m.prisma.style.findUnique({ where: { number: "72232" } });
    const bytes = fs.readFileSync(path.resolve(__dirname, "fixtures", "cad_72232.pdf"));
    const up = await m.cad.uploadCad({ styleId: style.id, bytes, fileName: "cad.pdf", user: "t" });
    expect(up.data.lengthPerSet.value).toBe(0.77);
    const ed = await m.cad.editCadField({ styleId: style.id, field: "totalLength", value: 3.874, reason: "unit was inches", user: "u" });
    expect(ed.revision).toBe(2);
    expect(ed.data.totalLength.value).toBe(152.54);
    expect(ed.data.totalLength.manual).toMatchObject({ value: 3.874 });
    await expect(m.cad.uploadCad({ styleId: style.id, bytes: Buffer.from("not a pdf"), fileName: "x.pdf", user: "t" })).rejects.toThrow(/PDF/);
  });

  it("client costing has one default template per customer layout; a style resolves its layout from brand, then customer", async () => {
    // DEFAULT layout exists from the first test; learn the YOUSTA layout from its reference workbook
    const y = await m.tpl.rebuildTemplateFromReference("CLIENT", ref("client_costing_YOUSTA.xlsx"), "client_costing_YOUSTA.xlsx", "t", { key: "YOUSTA", label: "YOUSTA" });
    expect(y.format).toBe("YOUSTA");
    const formats = await m.tpl.listClientFormats();
    expect(formats.map((f: { key: string }) => f.key)).toEqual(["DEFAULT", "YOUSTA"]);
    const def = await m.tpl.getTemplate("CLIENT");
    const you = await m.tpl.getTemplate("CLIENT", "youSTA");
    expect(def.doc.client.format.key).toBe("DEFAULT");
    expect(you.doc.client.format.key).toBe("YOUSTA");
    expect(you.doc.client.sections.map((s: { label: string }) => s.label)).toContain("Print/Emb/Washing");
    expect(def.doc.client.sections.map((s: { label: string }) => s.label)).not.toContain("Print/Emb/Washing");
    expect(await m.tpl.getTemplate("CLIENT", "NOPE")).toBeNull();

    // editing one layout never touches the other
    const edited = m.lib.addClientSection(you.doc, "Dyeing");
    const saved = await m.tpl.saveTemplate("CLIENT", edited, "u", "YOUSTA");
    expect(saved.version).toBe(you.version + 1);
    expect(saved.doc.client.format.key).toBe("YOUSTA");
    expect((await m.tpl.getTemplate("CLIENT")).version).toBe(def.version);
    // the original template of the other mode is not affected by a format argument
    expect((await m.tpl.getTemplate("ACTUAL", "YOUSTA")).format).toBe("DEFAULT");

    const fy = await m.prisma.clientFormat.findUnique({ where: { key: "YOUSTA" } });
    const fd = await m.prisma.clientFormat.findUnique({ where: { key: "DEFAULT" } });
    const cust = await m.prisma.customer.create({ data: { name: "Yousta Retail", clientFormatId: fd.id } });
    const brand = await m.prisma.brand.create({ data: { name: "YOUSTA", customerId: cust.id, clientFormatId: fy.id } });
    const plain = await m.prisma.brand.create({ data: { name: "House", customerId: cust.id } });
    const s1 = await m.prisma.style.create({ data: { number: "A1", customerId: cust.id, brandId: brand.id } });
    const s2 = await m.prisma.style.create({ data: { number: "A2", customerId: cust.id, brandId: plain.id } });
    const s3 = await m.prisma.style.create({ data: { number: "A3" } });
    expect((await m.cost.getWorkspace(s1.id)).style.clientFormat).toBe("YOUSTA"); // brand wins
    expect((await m.cost.getWorkspace(s2.id)).style.clientFormat).toBe("DEFAULT"); // falls back to the customer's layout
    expect((await m.cost.getWorkspace(s3.id)).style.clientFormat).toBeNull(); // nothing assigned → default layout
  });

  it("loads the standard rates into the fabric and rate masters, repeatably, without touching the user's own rows", async () => {
    const svc = await import("@/services/standardRatesService");
    await m.prisma.rateMaster.create({ data: { costingType: "ACTUAL", sectionKey: "TRIMS", itemName: "my own tag", rate: 9, source: "Costing Desk" } });
    await m.prisma.fabricMaster.create({ data: { name: "Cotton slub", lastRate: 99, source: "Costing Desk" } });
    const first = await svc.loadStandardRates("t");
    expect(first.fabrics.keptYours).toBe(1);
    expect(first.rates.replaced).toBe(0);
    expect(first.rates.added).toBeGreaterThan(30);
    const count = await m.prisma.rateMaster.count();
    const second = await svc.loadStandardRates("t");
    expect(second.rates.replaced).toBe(first.rates.added); // refreshed, not duplicated
    expect(await m.prisma.rateMaster.count()).toBe(count);
    expect((await m.prisma.rateMaster.findMany({ where: { itemName: "my own tag" } })).length).toBe(1);
    expect((await m.prisma.fabricMaster.findUnique({ where: { name: "Cotton slub" } })).lastRate).toBe(99); // yours, kept
    const flex = await m.prisma.fabricMaster.findUnique({ where: { name: "Cotton flex" } });
    expect(flex.lastRate).toBeGreaterThan(80);
    expect(flex.source).toMatch(/^Standard rates/);
    expect((await m.prisma.auditEvent.findMany({ where: { action: "MASTER_LOAD_STANDARD_RATES" } })).length).toBe(2);
  });
});
