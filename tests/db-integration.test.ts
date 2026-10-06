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
    await prisma.$executeRawUnsafe(`TRUNCATE "AuditEvent","CadExtraction","CostingVersion","Costing","StoredFile","StyleAlias","Style","Category","Uom","CostSection","CostItem","FabricMaster","RateMaster","CostingRule","CostTemplate" RESTART IDENTITY CASCADE`);
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
});
