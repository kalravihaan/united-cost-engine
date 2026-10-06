import type { CostingType } from "./costing";

/** Maps cost lines to comparison groups. Configurable data (Masters → Costing Rules), never code. */
export interface GroupRule {
  id: string;
  /** which costing the rule applies to */
  costingType: CostingType | "BOTH";
  /** Target comparison group name */
  group: string;
  /** match on normalized section key(s) (OR) */
  sectionKeys?: string[];
  /** case-insensitive regex tested against the cost item (and description when item is blank) */
  itemRegex?: string;
  note?: string;
}

export interface CadMappingRule {
  id: string;
  costingType: CostingType;
  /** where the CAD value goes */
  target:
    | { kind: "LINE_FIELD"; field: "quantity"; sectionKeys?: string[]; itemRegex: string }
    | { kind: "ACTUAL_CONSUMPTION" };
  cadField: "lengthPerSet";
  /** required dimension of the target line UOM (e.g. length_m for "mtr") */
  requireUomDimension?: "length_m";
  note: string;
}

export interface RuleSet {
  groupRules: GroupRule[];
  /** display order of comparison groups */
  groupOrder: string[];
  cadMappingRules: CadMappingRule[];
}

export interface CategoryTier {
  /** fraction (0.08) */
  rate: number;
  category: string;
  qty: number | null;
  source: string;
}
