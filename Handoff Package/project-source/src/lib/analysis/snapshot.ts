import raw from "@/data/analysisSnapshot.json";

/** The cost analysis (scripts/analysis/build_cost_analysis.py) as plain tables: one per sheet of cost_analysis.xlsx. */
export interface SnapshotTable {
  columns: string[];
  rows: Array<Array<string | number | null>>;
}
export interface Snapshot {
  generated: string;
  tables: Record<string, SnapshotTable>;
}

export const SNAPSHOT = raw as unknown as Snapshot;

export type Rec = Record<string, string | number | null>;

/** A snapshot table as an array of objects keyed by column name. */
export function records(name: string, snap: Snapshot = SNAPSHOT): Rec[] {
  const t = snap.tables[name];
  if (!t) return [];
  return t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? null])) as Rec);
}
