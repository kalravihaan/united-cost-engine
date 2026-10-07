// Reads prisma/schema.prisma and writes standalone/gen/schemaMeta.json (models, fields, defaults, uniques, relations).
// The in-browser store (memdb.ts) is generic: it never hard-codes a table, so the schema stays the single source of truth.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const text = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const enums = new Set([...text.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]));
const modelNames = new Set([...text.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]));
const models = {};

for (const m of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const [, name, body] = m;
  const fields = {};
  const uniques = [];
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    if (line.startsWith("@@unique")) {
      uniques.push(line.match(/\[([^\]]+)\]/)[1].split(",").map((s) => s.trim()));
      continue;
    }
    if (line.startsWith("@@")) continue;
    const f = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
    if (!f) continue;
    const [, fname, type, list, optional, attrs] = f;
    const meta = { type, list: !!list, optional: !!optional, kind: modelNames.has(type) ? "object" : enums.has(type) ? "enum" : "scalar" };
    if (/@id\b/.test(attrs)) {
      meta.id = true;
      uniques.push([fname]);
    }
    if (/@unique\b/.test(attrs)) uniques.push([fname]);
    if (/@updatedAt\b/.test(attrs)) meta.updatedAt = true;
    const d = attrs.match(/@default\((.*?)\)(?:\s|$)/);
    if (d) {
      const v = d[1].trim();
      if (v === "cuid()") meta.default = { fn: "cuid" };
      else if (v === "now()") meta.default = { fn: "now" };
      else if (v === "autoincrement()") meta.default = { fn: "autoincrement" };
      else if (v === "true" || v === "false") meta.default = { value: v === "true" };
      else if (/^-?\d+(\.\d+)?$/.test(v)) meta.default = { value: Number(v) };
      else if (/^".*"$/.test(v)) meta.default = { value: JSON.parse(v) };
      else meta.default = { value: v }; // enum member
    }
    const r = attrs.match(/@relation\(([^)]*)\)/);
    if (r) {
      const from = r[1].match(/fields:\s*\[([^\]]*)\]/);
      const refs = r[1].match(/references:\s*\[([^\]]*)\]/);
      const nm = r[1].match(/^\s*"([^"]+)"/) ?? r[1].match(/name:\s*"([^"]+)"/);
      meta.relation = { name: nm?.[1], fromFields: from?.[1].split(",").map((s) => s.trim()), references: refs?.[1].split(",").map((s) => s.trim()), onDelete: r[1].match(/onDelete:\s*(\w+)/)?.[1] };
    }
    fields[fname] = meta;
  }
  models[name] = { fields, uniques };
}
fs.mkdirSync(path.join(import.meta.dirname, "gen"), { recursive: true });
fs.writeFileSync(path.join(import.meta.dirname, "gen/schemaMeta.json"), JSON.stringify({ models }, null, 1));
console.log(`schemaMeta.json: ${Object.keys(models).length} models`);
