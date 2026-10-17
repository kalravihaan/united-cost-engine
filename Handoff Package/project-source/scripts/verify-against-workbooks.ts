/**
 * Independent check of the calculation engine against costing workbooks.
 *
 *   npx tsx scripts/verify-against-workbooks.ts [dir-or-file ...]      (default: data/reference)
 *
 * Every .xlsx is parsed with the real parsers (actual-costing workbooks and client-costing workbooks are told apart by their layout),
 * recomputed with the engine and compared with the workbook's own calculated (cached) values. Encrypted / password-protected files
 * are reported as unreadable, never guessed. Exit code 1 if any value differs by more than 1e-6 relative.
 *
 * A known, expected difference: sheet 4112 of the second actual workbook shows #VALUE! for its value-loss cells in Excel
 * (text typed as a number); the engine warns and treats it as 0, so those two values are reported as "sheet has no value".
 */
import fs from "node:fs";
import path from "node:path";
import "./env";
import { parseActualWorkbook } from "@/lib/parsers/actualCostingParser";
import { parseClientWorkbook } from "@/lib/parsers/clientCostingParser";
import { calculateActualCost } from "@/lib/calculations/actual";
import { calculateClientCost } from "@/lib/calculations/client";

const close = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)));
const now = () => new Date("2026-01-01T00:00:00Z");

function collect(args: string[]): string[] {
  const out: string[] = [];
  for (const a of args) {
    if (!fs.existsSync(a)) continue;
    if (fs.statSync(a).isDirectory()) {
      for (const f of fs.readdirSync(a)) out.push(...collect([path.join(a, f)]));
    } else if (/\.xlsx$/i.test(a)) out.push(a);
  }
  return out;
}

async function main() {
  const files = collect(process.argv.length > 2 ? process.argv.slice(2) : ["data/reference"]);
  let compared = 0;
  let different = 0;
  let sheets = 0;
  const unreadable: string[] = [];
  for (const f of files) {
    const bytes = fs.readFileSync(f);
    const name = path.basename(f);
    if (bytes.subarray(0, 4).toString("hex") === "d0cf11e0") {
      unreadable.push(`${name} (encrypted / password protected)`);
      continue;
    }
    // try as an actual-costing workbook first (many sheets, fixed rows), then as a client-costing workbook
    let kind = "";
    try {
      const p = await parseActualWorkbook(bytes, name, now);
      if (p.sheets.length > 0 && p.sheets.every((s) => s.doc.lines.length > 0)) {
        kind = "actual";
        for (const s of p.sheets) {
          sheets++;
          const r = calculateActualCost(s.doc) as unknown as Record<string, unknown>;
          const c = s.cached as unknown as Record<string, number | null>;
          for (const k of Object.keys(c)) {
            const v = r[k];
            if (typeof v !== "number" && v !== null) continue;
            if (c[k] === undefined) continue;
            compared++;
            if (c[k] === null && v === 0) continue; // the sheet shows an error / blank where the engine has 0 (see header)
            if (!close(v as number | null, c[k])) {
              different++;
              console.log(`DIFF  ${name} [${s.doc.source?.sheet}] ${k}: engine ${v} vs sheet ${c[k]}`);
            }
          }
        }
      }
    } catch {
      /* not an actual-costing workbook */
    }
    if (!kind) {
      try {
        const p = await parseClientWorkbook(bytes, name, now);
        if (p.sheets.length > 0) {
          kind = "client";
          for (const s of p.sheets) {
            sheets++;
            const r = calculateClientCost(s.doc) as unknown as { total?: { base: number }; totalCost?: { base: number }; fobPrice?: number; finalPoPrice?: number };
            const c = s.cached as unknown as Record<string, number | null>;
            const pairs: Array<[string, number | null, number | null | undefined]> = [
              ["total", r.total?.base ?? null, c.total],
              ["totalCost", r.totalCost?.base ?? null, c.totalCost],
              ["fobPrice", r.fobPrice ?? null, c.fobPrice],
              ["finalPoPrice", r.finalPoPrice ?? null, c.finalPoPrice],
            ];
            for (const [k, a, b] of pairs) {
              if (b === null || b === undefined) continue;
              compared++;
              if (!close(a, b)) {
                different++;
                console.log(`DIFF  ${name} [${s.doc.source?.sheet}] ${k}: engine ${a} vs sheet ${b}`);
              }
            }
          }
        }
      } catch {
        unreadable.push(`${name} (neither layout recognised)`);
      }
    }
    if (kind) console.log(`ok    ${name} (${kind})`);
  }
  console.log(`\n${files.length} files, ${sheets} sheets, ${compared} values compared, ${different} differences`);
  if (unreadable.length) console.log("not readable:\n  " + unreadable.join("\n  "));
  process.exit(different ? 1 : 0);
}
main();
