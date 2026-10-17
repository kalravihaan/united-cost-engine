import { prisma } from "../db";
import { masterByName, type MasterDef } from "@/data/masterConfig";

/** Generic access to the declarative masters. Only whitelisted models/fields are reachable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (def: MasterDef): any => (prisma as any)[def.model];

function def(name: string): MasterDef {
  const d = masterByName(name);
  if (!d) throw new Error(`Unknown master "${name}"`);
  return d;
}

function coerce(d: MasterDef, input: Record<string, unknown>, creating: boolean) {
  const out: Record<string, unknown> = {};
  for (const f of d.fields) {
    if (!(f.key in input)) continue;
    if (f.readOnly && !creating) continue;
    let v = input[f.key];
    if (v === "" || v === undefined) v = null;
    if (v !== null) {
      if (f.type === "number") v = Number(v);
      else if (f.type === "percent") v = Number(v); // stored as fraction; the UI converts
      else if (f.type === "boolean") v = v === true || v === "true";
      else if (f.type === "json") v = typeof v === "string" ? JSON.parse(v) : v;
      else v = String(v);
    }
    if ((f.type === "number" || f.type === "percent") && v !== null && !Number.isFinite(v as number)) throw new Error(`${f.label}: not a number`);
    if (f.required && (v === null || v === "") && f.type !== "boolean") throw new Error(`${f.label} is required`);
    if (f.key === "phase" && v === "") v = null;
    out[f.key] = v;
  }
  if (creating) for (const f of d.fields) if (f.required && f.type !== "boolean" && out[f.key] == null) throw new Error(`${f.label} is required`);
  return out;
}

export const masterRepository = {
  async list(name: string) {
    const d = def(name);
    const orderBy = { [d.orderBy]: "asc" };
    return delegate(d).findMany({ orderBy, take: 2000 });
  },
  async create(name: string, input: Record<string, unknown>) {
    const d = def(name);
    if (d.noCreate) throw new Error(`${d.label} are created by the workflow, not manually`);
    return delegate(d).create({ data: coerce(d, input, true) });
  },
  async update(name: string, id: string, input: Record<string, unknown>) {
    const d = def(name);
    return delegate(d).update({ where: { id }, data: coerce(d, input, false) });
  },
  /** options for ref dropdowns: [{id, label}] */
  async options(name: string) {
    const d = def(name);
    const rows = await delegate(d).findMany({ orderBy: { [d.orderBy]: "asc" }, take: 2000 });
    return rows.map((r: Record<string, unknown>) => ({ id: r.id as string, label: String(r[d.display] ?? r.id) }));
  },
  async removeAlias(id: string) {
    return prisma.styleAlias.delete({ where: { id } });
  },
};
