import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Database integration (versioning, audit, import idempotency, CAD revisions).
 * Runs against TEST_DATABASE_URL (a disposable PostgreSQL database with the schema pushed); skipped when unset.
 *   TEST_DATABASE_URL=postgresql://… npx prisma db push   (with DATABASE_URL pointing at it) then npm test
 */
const url = process.env.TEST_DATABASE_URL;
if (url && !/test/i.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test' (the suite truncates tables)");
const d = url ? describe : describe.skip;
const src = (f: string) => fs.readFileSync(path.resolve(__dirname, "..", "data", "sources", f));

d("database: versioning, audit, import, CAD revisions", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.STORAGE_DIR = path.resolve(__dirname, "..", "storage-test");
    const { prisma } = await import("@/server/db");
    // fresh schema state
    await prisma.$executeRawUnsafe(`TRUNCATE "AuditEvent","CadExtraction","CostingVersion","Costing","ImportBatch","StoredFile","StyleAlias","Style","Category","Uom","CostSection","CostItem","FabricMaster","RateMaster","CostingRule" RESTART IDENTITY CASCADE`);
    m = {
      prisma,
      imp: await import("@/services/importService"),
      cost: await import("@/services/costingService"),
      cad: await import("@/services/cadService"),
      setLine: (await import("@/lib/calculations")).setLineField,
    };
  });
  afterAll(async () => {
    await m?.prisma.$disconnect();
    fs.rmSync(path.resolve(__dirname, "..", "storage-test"), { recursive: true, force: true });
  });

  it("imports both workbooks and is idempotent", async () => {
    const a1 = await m.imp.importActualWorkbook(src("actual_costing.xlsx"), "actual_costing.xlsx", "t");
    expect(a1.created).toBe(28);
    const c1 = await m.imp.importClientWorkbook(src("client_costing.xlsx"), "client_costing.xlsx", "t");
    expect(c1.created).toBe(1);
    const before = await m.prisma.costingVersion.count();
    const a2 = await m.imp.importActualWorkbook(src("actual_costing.xlsx"), "actual_costing.xlsx", "t");
    const c2 = await m.imp.importClientWorkbook(src("client_costing.xlsx"), "client_costing.xlsx", "t");
    expect(a2.created + c2.created).toBe(0);
    expect(a2.skipped).toBe(28);
    expect(await m.prisma.costingVersion.count()).toBe(before);
    expect(await m.prisma.category.count()).toBe(3);
    expect((await m.prisma.style.findUnique({ where: { number: "0556" } })).number).toBe("0556");
  });

  it("saving appends an immutable version and records audit + changed fields", async () => {
    const style = await m.prisma.style.findUnique({ where: { number: "5008" } });
    const w1 = await m.cost.getWorkspace(style.id);
    const v1 = w1.client;
    const main = v1.doc.lines.find((l: { item: string }) => l.item === "Main Fabric");
    const edited = m.setLine(v1.doc, main.id, "rate", 80, { by: "tester", reason: "price revision" });
    const saved = await m.cost.saveCostingVersion({ styleId: style.id, doc: edited, note: "rate 77→80", user: "tester" });
    expect(saved.unchanged).toBe(false);
    expect(saved.version.versionNo).toBe(2);
    expect(saved.version.result.totalCost.base).toBeCloseTo(242.3735 + 1.6 * 3 * 1.1, 9);
    // v1 untouched
    const vs = await m.cost.listVersions(style.id, "CLIENT");
    expect(vs.map((v: { versionNo: number }) => v.versionNo)).toEqual([2, 1]);
    const old = await m.cost.getVersion(vs[1].id);
    expect(old.doc.lines.find((l: { item: string }) => l.item === "Main Fabric").rate).toBe(77);
    expect(old.result.totalCost.base).toBeCloseTo(242.3735, 9);
    expect(vs[0].changedFields).toEqual([{ path: "Main Fabric.rate", before: 77, after: 80 }]);
    // saving the same document again creates nothing
    const again = await m.cost.saveCostingVersion({ styleId: style.id, doc: saved.version.doc, user: "tester" });
    expect(again.unchanged).toBe(true);
    const audit = await m.prisma.auditEvent.findMany({ where: { styleId: style.id, action: "SAVE_VERSION" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].userName).toBe("tester");
  });

  it("rejects malformed documents", async () => {
    const style = await m.prisma.style.findUnique({ where: { number: "5008" } });
    await expect(m.cost.saveCostingVersion({ styleId: style.id, doc: { type: "CLIENT", lines: "x" }, user: "t" })).rejects.toThrow(/Invalid costing document/);
  });

  it("a template can only start a costing that does not exist", async () => {
    const s5008 = await m.prisma.style.findUnique({ where: { number: "5008" } });
    const created = await m.prisma.style.create({ data: { number: "72232" } });
    await expect(m.cost.startCostingFromTemplate({ styleId: s5008.id, type: "CLIENT", templateStyleId: created.id, mode: "STRUCTURE", user: "t" })).rejects.toThrow(/already has/);
    const r = await m.cost.startCostingFromTemplate({ styleId: created.id, type: "CLIENT", templateStyleId: s5008.id, mode: "STRUCTURE", user: "t" });
    expect(r.version.versionNo).toBe(1);
    expect(r.version.sourceKind).toBe("TEMPLATE");
    expect(r.version.result.totalCost.base).toBe(0);
  });

  it("CAD upload extracts values; edits create new revisions and keep the extracted value", async () => {
    const style = await m.prisma.style.findUnique({ where: { number: "72232" } });
    const up = await m.cad.uploadCad({ styleId: style.id, bytes: src("cad_72232.pdf"), fileName: "cad.pdf", user: "t" });
    expect(up.data.lengthPerSet.value).toBe(0.77);
    expect(up.revision).toBe(1);
    const ed = await m.cad.editCadField({ styleId: style.id, field: "totalLength", value: 3.874, reason: "unit was inches", user: "u" });
    expect(ed.revision).toBe(2);
    expect(ed.data.totalLength.value).toBe(152.54); // extracted value preserved
    expect(ed.data.totalLength.manual).toMatchObject({ value: 3.874, reason: "unit was inches" });
    expect(await m.prisma.cadExtraction.count({ where: { styleId: style.id } })).toBe(2);
    await expect(m.cad.uploadCad({ styleId: style.id, bytes: Buffer.from("not a pdf"), fileName: "x.pdf", user: "t" })).rejects.toThrow(/PDF/);
  });
});
