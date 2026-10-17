/**
 * In-memory, Prisma-compatible store used by the single-file build.
 *
 * It implements the subset of the Prisma client API that this app's repositories/services use
 * (findUnique/findFirst/findMany/count/create/update/upsert/delete + include/select/orderBy/take/skip,
 * where with equality, in, contains, OR/AND/NOT, compound unique keys, $transaction with rollback).
 * It is driven entirely by standalone/gen/schemaMeta.json (generated from prisma/schema.prisma), so no table
 * is hard-coded here. The same DB integration tests that run against PostgreSQL run against this store.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import META from "./gen/schemaMeta.json";

type Row = Record<string, any>;
interface FieldMeta {
  type: string;
  list: boolean;
  optional: boolean;
  kind: "scalar" | "enum" | "object";
  id?: boolean;
  updatedAt?: boolean;
  default?: { fn?: string; value?: unknown };
  relation?: { name?: string; fromFields?: string[]; references?: string[]; onDelete?: string };
}
interface ModelMeta {
  fields: Record<string, FieldMeta>;
  uniques: string[][];
}
const MODELS = (META as unknown as { models: Record<string, ModelMeta> }).models;
const delegateName = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
const OPS = ["equals", "in", "notIn", "not", "contains", "startsWith", "endsWith", "gt", "gte", "lt", "lte", "mode"];

class DbError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
  }
}

let seq = 0;
const cuid = () => "c" + Date.now().toString(36) + (seq++).toString(36).padStart(3, "0") + Math.random().toString(36).slice(2, 8);
const isPlainObject = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v);
const clone = <T,>(v: T): T => (v === undefined ? v : structuredClone(v));

function cmp(a: any, b: any): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return a < b ? -1 : a > b ? 1 : 0;
}
const eq = (a: any, b: any) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b || (a == null && b == null));

export interface MemoryDb {
  client: any;
  /** plain-JSON snapshot of all rows (Dates tagged) */
  snapshot(): Record<string, Row[]>;
  restore(snap: Record<string, Row[]> | null): void;
  /** called after every committed write */
  onChange(fn: () => void): void;
  clear(): void;
  count(model: string): number;
}

export function createMemoryDb(): MemoryDb {
  const tables: Record<string, Row[]> = {};
  for (const m of Object.keys(MODELS)) tables[m] = [];
  let undo: Array<() => void> | null = null;
  let listeners: Array<() => void> = [];
  let dirty = false;
  const autoinc: Record<string, number> = {};

  const note = (fn: () => void) => {
    undo?.push(fn);
    dirty = true;
  };
  const flush = () => {
    if (!dirty || undo) return;
    dirty = false;
    for (const l of listeners) l();
  };

  /* ───────── where ───────── */
  const matchScalar = (val: any, cond: any, fm: FieldMeta | undefined): boolean => {
    if (!isPlainObject(cond) || !Object.keys(cond).some((k) => OPS.includes(k))) return eq(val, cond);
    const insensitive = cond.mode === "insensitive";
    const norm = (x: any) => (insensitive && typeof x === "string" ? x.toLowerCase() : x);
    for (const [op, arg] of Object.entries(cond)) {
      switch (op) {
        case "mode": break;
        case "equals": if (!eq(norm(val), norm(arg))) return false; break;
        case "not": if (isPlainObject(arg) ? matchScalar(val, arg, fm) : eq(norm(val), norm(arg))) return false; break;
        case "in": if (!(arg as any[]).some((a) => eq(norm(val), norm(a)))) return false; break;
        case "notIn": if ((arg as any[]).some((a) => eq(norm(val), norm(a)))) return false; break;
        case "contains": if (typeof val !== "string" || !norm(val).includes(norm(arg))) return false; break;
        case "startsWith": if (typeof val !== "string" || !norm(val).startsWith(norm(arg))) return false; break;
        case "endsWith": if (typeof val !== "string" || !norm(val).endsWith(norm(arg))) return false; break;
        case "gt": if (!(cmp(val, arg) > 0)) return false; break;
        case "gte": if (!(cmp(val, arg) >= 0)) return false; break;
        case "lt": if (!(cmp(val, arg) < 0)) return false; break;
        case "lte": if (!(cmp(val, arg) <= 0)) return false; break;
      }
    }
    return true;
  };

  const flattenUnique = (model: string, where: Row): Row => {
    const out: Row = {};
    for (const [k, v] of Object.entries(where)) {
      const fm = MODELS[model].fields[k];
      if (!fm && isPlainObject(v) && MODELS[model].uniques.some((u) => u.join("_") === k)) Object.assign(out, v);
      else out[k] = v;
    }
    return out;
  };

  const matches = (model: string, row: Row, where: Row | undefined): boolean => {
    if (!where) return true;
    const mm = MODELS[model];
    for (const [k, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (k === "AND") { if (!([] as any[]).concat(cond).every((c) => matches(model, row, c))) return false; continue; }
      if (k === "OR") { if (!([] as any[]).concat(cond).some((c) => matches(model, row, c))) return false; continue; }
      if (k === "NOT") { if (([] as any[]).concat(cond).some((c) => matches(model, row, c))) return false; continue; }
      const fm = mm.fields[k];
      if (!fm) {
        if (isPlainObject(cond) && mm.uniques.some((u) => u.join("_") === k)) {
          if (!Object.entries(cond).every(([ck, cv]) => eq(row[ck], cv))) return false;
          continue;
        }
        throw new Error(`Unknown field "${k}" in where for ${model}`);
      }
      if (fm.kind === "object") {
        const rel = related(model, row, k);
        if (fm.list) {
          const list = rel as Row[];
          const c = cond as any;
          if (c.some && !list.some((r) => matches(fm.type, r, c.some))) return false;
          if (c.none && list.some((r) => matches(fm.type, r, c.none))) return false;
          if (c.every && !list.every((r) => matches(fm.type, r, c.every))) return false;
        } else {
          const r = rel as Row | null;
          const c = (cond as any).is !== undefined ? (cond as any).is : cond;
          if (c === null) { if (r) return false; } else if (!r || !matches(fm.type, r, c)) return false;
        }
        continue;
      }
      if (!matchScalar(row[k], cond, fm)) return false;
    }
    return true;
  };

  /* ───────── relations ───────── */
  const relationInfo = (model: string, field: string) => {
    const fm = MODELS[model].fields[field];
    if (fm.relation?.fromFields) return { side: "owner" as const, from: fm.relation.fromFields, refs: fm.relation.references ?? ["id"] };
    // the other side holds the foreign key
    const other = MODELS[fm.type];
    const back = Object.entries(other.fields).find(([, f]) => f.kind === "object" && f.type === model && f.relation?.fromFields && (f.relation.name ?? null) === (fm.relation?.name ?? null));
    const found = back ?? Object.entries(other.fields).find(([, f]) => f.kind === "object" && f.type === model && f.relation?.fromFields);
    if (!found) throw new Error(`Cannot resolve relation ${model}.${field}`);
    return { side: "inverse" as const, from: found[1].relation!.fromFields!, refs: found[1].relation!.references ?? ["id"] };
  };
  function related(model: string, row: Row, field: string): Row | Row[] | null {
    const fm = MODELS[model].fields[field];
    const info = relationInfo(model, field);
    const target = tables[fm.type];
    if (info.side === "owner") {
      if (info.from.some((f) => row[f] === null || row[f] === undefined)) return null;
      return target.find((t) => info.from.every((f, i) => eq(t[info.refs[i]], row[f]))) ?? null;
    }
    const kids = target.filter((t) => info.from.every((f, i) => eq(t[f], row[info.refs[i]])));
    return fm.list ? kids : kids[0] ?? null;
  }

  /* ───────── projection ───────── */
  const orderRows = (rows: Row[], orderBy: any): Row[] => {
    if (!orderBy) return rows;
    const specs = ([] as any[]).concat(orderBy).flatMap((o) => Object.entries(o) as Array<[string, any]>);
    return [...rows].sort((a, b) => {
      for (const [f, dir] of specs) {
        const d = (isPlainObject(dir) ? dir.sort : dir) === "desc" ? -1 : 1;
        const c = cmp(a[f], b[f]);
        if (c !== 0) return c * d;
      }
      return 0;
    });
  };

  function project(model: string, row: Row, args: { select?: Row; include?: Row } | undefined): Row {
    const mm = MODELS[model];
    const out: Row = {};
    const addRel = (field: string, spec: any) => {
      const fm = mm.fields[field];
      if (!fm || fm.kind !== "object") throw new Error(`Unknown relation "${field}" on ${model}`);
      let rel = related(model, row, field);
      if (fm.list) {
        let list = rel as Row[];
        if (isPlainObject(spec)) {
          if (spec.where) list = list.filter((r) => matches(fm.type, r, spec.where));
          list = orderRows(list, spec.orderBy);
          if (spec.skip) list = list.slice(spec.skip);
          if (spec.take !== undefined) list = list.slice(0, spec.take);
          out[field] = list.map((r) => project(fm.type, r, spec));
        } else out[field] = list.map((r) => project(fm.type, r, undefined));
      } else {
        rel = rel as Row | null;
        out[field] = rel ? project(fm.type, rel, isPlainObject(spec) ? spec : undefined) : null;
      }
    };
    if (args?.select) {
      for (const [k, v] of Object.entries(args.select)) {
        if (!v) continue;
        if (mm.fields[k]?.kind === "object") addRel(k, v);
        else if (mm.fields[k]) out[k] = clone(row[k]);
        else throw new Error(`Unknown field "${k}" in select for ${model}`);
      }
      return out;
    }
    for (const [k, f] of Object.entries(mm.fields)) if (f.kind !== "object") out[k] = clone(row[k]);
    for (const [k, v] of Object.entries(args?.include ?? {})) if (v) addRel(k, v);
    return out;
  }

  /* ───────── writes ───────── */
  const uniqueViolation = (model: string, cand: Row, ignore?: Row): string | null => {
    for (const u of MODELS[model].uniques) {
      if (u.some((f) => cand[f] === null || cand[f] === undefined)) continue;
      if (tables[model].some((r) => r !== ignore && u.every((f) => eq(r[f], cand[f])))) return u.join(", ");
    }
    return null;
  };
  const checkForeignKeys = (model: string, cand: Row) => {
    for (const [k, f] of Object.entries(MODELS[model].fields)) {
      if (f.kind !== "object" || !f.relation?.fromFields) continue;
      const vals = f.relation.fromFields.map((x) => cand[x]);
      if (vals.some((v) => v === null || v === undefined)) continue;
      const refs = f.relation.references ?? ["id"];
      if (!tables[f.type].some((t) => refs.every((r, i) => eq(t[r], vals[i])))) throw new DbError("P2003", `Foreign key constraint violated on ${model}.${k}`);
    }
  };
  const coerceData = (model: string, data: Row): Row => {
    const out: Row = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const fm = MODELS[model].fields[k];
      if (!fm || fm.kind === "object") throw new Error(`Unknown argument "${k}" for ${model}`);
      if (fm.type === "DateTime" && typeof v === "string") out[k] = new Date(v);
      else if (fm.type === "Json") out[k] = clone(v);
      else out[k] = isPlainObject(v) && ("set" in v || "increment" in v) ? (v as any).set : v;
    }
    return out;
  };

  function insert(model: string, data: Row): Row {
    const mm = MODELS[model];
    const row: Row = coerceData(model, data);
    for (const [k, f] of Object.entries(mm.fields)) {
      if (f.kind === "object" || k in row) continue;
      if (f.default?.fn === "cuid") row[k] = cuid();
      else if (f.default?.fn === "now") row[k] = new Date();
      else if (f.default?.fn === "autoincrement") row[k] = autoinc[model + k] = (autoinc[model + k] ?? 0) + 1;
      else if (f.default && "value" in f.default) row[k] = f.default.value;
      else if (f.updatedAt) row[k] = new Date();
      else if (!f.optional) throw new Error(`Argument \`${k}\` is missing for ${model}`);
      else row[k] = null;
    }
    const dup = uniqueViolation(model, row);
    if (dup) throw new DbError("P2002", `Unique constraint failed on the fields: (${dup})`);
    checkForeignKeys(model, row);
    tables[model].push(row);
    note(() => { tables[model].splice(tables[model].indexOf(row), 1); });
    return row;
  }

  function modify(model: string, row: Row, data: Row): Row {
    const next: Row = { ...row, ...coerceData(model, data) };
    for (const [k, f] of Object.entries(MODELS[model].fields)) if (f.updatedAt) next[k] = new Date();
    const dup = uniqueViolation(model, next, row);
    if (dup) throw new DbError("P2002", `Unique constraint failed on the fields: (${dup})`);
    checkForeignKeys(model, next);
    const i = tables[model].indexOf(row);
    tables[model][i] = next;
    note(() => { tables[model][tables[model].indexOf(next)] = row; });
    return next;
  }

  function remove(model: string, row: Row) {
    for (const [other, om] of Object.entries(MODELS)) {
      for (const f of Object.values(om.fields)) {
        if (f.kind !== "object" || f.type !== model || !f.relation?.fromFields) continue;
        const refs = f.relation.references ?? ["id"];
        const kids = tables[other].filter((k) => f.relation!.fromFields!.every((ff, i) => eq(k[ff], row[refs[i]])));
        if (!kids.length) continue;
        if (f.relation.onDelete === "Cascade") for (const k of kids) remove(other, k);
        else throw new DbError("P2003", `Foreign key constraint violated: ${other} references ${model}`);
      }
    }
    const i = tables[model].indexOf(row);
    tables[model].splice(i, 1);
    note(() => { tables[model].splice(i, 0, row); });
  }

  /* ───────── delegates ───────── */
  const find = (model: string, where: Row | undefined, all = false) => {
    const w = where ? flattenUnique(model, where) : undefined;
    const rows = tables[model].filter((r) => matches(model, r, w));
    return all ? rows : rows[0] ?? null;
  };

  const makeDelegate = (model: string) => {
    const one = (args: any) => {
      const rows = find(model, args?.where, true) as Row[];
      const row = args?.orderBy ? orderRows(rows, args.orderBy)[0] : rows[0];
      return row ? project(model, row, args) : null;
    };
    const many = (args: any = {}) => {
      let rows = orderRows(find(model, args.where, true) as Row[], args.orderBy);
      if (args.skip) rows = rows.slice(args.skip);
      if (args.take !== undefined) rows = rows.slice(0, args.take);
      return rows.map((r) => project(model, r, args));
    };
    const strict = (args: any) => {
      const where = args?.where;
      if (!where || !isPlainObject(where)) throw new Error("findUnique requires a where");
      return one(args);
    };
    const d: Record<string, (args?: any) => Promise<any>> = {
      findUnique: async (a) => strict(a),
      findUniqueOrThrow: async (a) => strict(a) ?? Promise.reject(new DbError("P2025", `No ${model} found`)),
      findFirst: async (a) => one(a),
      findFirstOrThrow: async (a) => one(a) ?? Promise.reject(new DbError("P2025", `No ${model} found`)),
      findMany: async (a) => many(a),
      count: async (a) => (find(model, a?.where, true) as Row[]).length,
      create: async (a) => { const r = insert(model, a.data); flush(); return project(model, r, a); },
      createMany: async (a) => { for (const x of a.data) insert(model, x); flush(); return { count: a.data.length }; },
      update: async (a) => {
        const row = find(model, a.where) as Row | null;
        if (!row) throw new DbError("P2025", `No ${model} found to update`);
        const next = modify(model, row, a.data);
        flush();
        return project(model, next, a);
      },
      updateMany: async (a) => { const rows = find(model, a.where, true) as Row[]; for (const r of rows) modify(model, r, a.data); flush(); return { count: rows.length }; },
      upsert: async (a) => {
        const row = find(model, a.where) as Row | null;
        const out = row ? modify(model, row, a.update ?? {}) : insert(model, a.create);
        flush();
        return project(model, out, a);
      },
      delete: async (a) => {
        const row = find(model, a.where) as Row | null;
        if (!row) throw new DbError("P2025", `No ${model} found to delete`);
        const out = project(model, row, a);
        remove(model, row);
        flush();
        return out;
      },
      deleteMany: async (a) => { const rows = find(model, a?.where, true) as Row[]; for (const r of rows) remove(model, r); flush(); return { count: rows.length }; },
    };
    return d;
  };

  const client: any = {
    async $transaction(arg: any) {
      if (Array.isArray(arg)) return Promise.all(arg);
      if (undo) return arg(client); // nested: join the outer transaction
      undo = [];
      try {
        const out = await arg(client);
        undo = null;
        flush();
        return out;
      } catch (e) {
        const log = undo!;
        undo = null;
        for (const fn of log.reverse()) fn();
        throw e;
      }
    },
    async $executeRawUnsafe(sql: string) {
      if (!/^\s*TRUNCATE/i.test(sql)) throw new Error("Raw SQL is not supported by the in-browser store");
      const names = [...sql.matchAll(/"(\w+)"/g)].map((m) => m[1]).filter((n) => MODELS[n]);
      let cleared = new Set(names);
      let grew = true;
      while (grew) {
        grew = false;
        for (const [m, mm] of Object.entries(MODELS)) {
          if (cleared.has(m)) continue;
          if (Object.values(mm.fields).some((f) => f.kind === "object" && f.relation?.fromFields && cleared.has(f.type))) { cleared = new Set([...cleared, m]); grew = true; }
        }
      }
      for (const m of cleared) tables[m] = [];
      flush();
      return 0;
    },
    async $disconnect() {},
    async $connect() {},
  };
  for (const m of Object.keys(MODELS)) client[delegateName(m)] = makeDelegate(m);

  const dateFields = (m: string) => Object.entries(MODELS[m].fields).filter(([, f]) => f.type === "DateTime").map(([k]) => k);
  return {
    client,
    onChange: (fn) => { listeners.push(fn); },
    clear() { for (const m of Object.keys(MODELS)) tables[m] = []; for (const k of Object.keys(autoinc)) delete autoinc[k]; },
    count: (m) => tables[m].length,
    snapshot() {
      const out: Record<string, Row[]> = {};
      for (const [m, rows] of Object.entries(tables)) {
        const dfs = dateFields(m);
        out[m] = rows.map((r) => {
          const c = clone(r);
          for (const f of dfs) if (c[f] instanceof Date) c[f] = { $date: c[f].toISOString() };
          return c;
        });
      }
      return out;
    },
    restore(snap) {
      for (const m of Object.keys(MODELS)) tables[m] = [];
      if (!snap) return;
      for (const [m, rows] of Object.entries(snap)) {
        if (!MODELS[m]) continue;
        const dfs = dateFields(m);
        tables[m] = rows.map((r) => {
          const c = clone(r);
          for (const f of dfs) if (c[f] && typeof c[f] === "object" && "$date" in c[f]) c[f] = new Date(c[f].$date);
          // columns added after the snapshot was taken get their default / null
          for (const [k, fm] of Object.entries(MODELS[m].fields)) if (fm.kind !== "object" && !(k in c)) c[k] = fm.default && "value" in fm.default ? fm.default.value : null;
          return c;
        });
      }
      listeners = listeners.slice();
    },
  };
}
