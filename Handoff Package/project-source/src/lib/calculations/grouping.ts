import type { CostLine, CostingType } from "@/types/costing";
import type { GroupRule } from "@/types/rules";

export const UNMAPPED_GROUP = "Unmapped";

/** First matching rule wins. Returns null when nothing matches (shown as "Unmapped", never dropped). */
export function groupForLine(line: CostLine, type: CostingType, rules: GroupRule[]): GroupRule | null {
  const text = (line.item || line.description || "").toLowerCase();
  for (const r of rules) {
    if (r.costingType !== "BOTH" && r.costingType !== type) continue;
    if (r.sectionKeys && !r.sectionKeys.includes(line.sectionKey)) continue;
    if (r.itemRegex) {
      try {
        if (!new RegExp(r.itemRegex, "i").test(text)) continue;
      } catch {
        continue; // invalid admin regex: rule ignored, line stays visible as Unmapped if nothing else matches
      }
    }
    return r;
  }
  return null;
}

export function isPackagingLine(line: CostLine, type: CostingType, rules: GroupRule[]): boolean {
  return groupForLine(line, type, rules)?.group === "Packaging";
}
