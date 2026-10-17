import type { RuleSet } from "@/types/rules";

/**
 * Initial, editable configuration.
 *
 * These are *mappings between source structures*, not source figures:
 *  - groupRules: which actual/client cost lines are compared against each other.
 *    The grouping is an interpretation (the two workbooks use different sections),
 *    so it is configurable in Masters → Costing Rules and every comparison lists
 *    the lines behind each group.
 *  - cadMappingRules: which costing fields CAD-derived values may feed.
 */
export const DEFAULT_RULES: RuleSet = {
  groupOrder: [
    "Fabric",
    "Embellishment",
    "CMT",
    "Trims",
    "Labels & Tags",
    "Packaging",
    "Other",
    "Garment Rejection",
    "Overhead + Margin",
  ],
  groupRules: [
    // ── Actual ──
    { id: "a-cmt", costingType: "ACTUAL", group: "CMT", sectionKeys: ["CMT"] },
    { id: "a-ld", costingType: "ACTUAL", group: "Other", sectionKeys: ["LD_CHARGES"] },
    { id: "a-fab-emb", costingType: "ACTUAL", group: "Embellishment", sectionKeys: ["FABRIC_ORDER"], itemRegex: "emb|hand ?work|scallop|\\bprint\\b" },
    { id: "a-fab-trim", costingType: "ACTUAL", group: "Trims", sectionKeys: ["FABRIC_ORDER"], itemRegex: "zipper|elastic|lace|dori|tass?[ae]l|button|bead|beed|trims? ?\\d" },
    { id: "a-fab", costingType: "ACTUAL", group: "Fabric", sectionKeys: ["FABRIC_ORDER"] },
    { id: "a-trim-label", costingType: "ACTUAL", group: "Labels & Tags", sectionKeys: ["TRIMS"], itemRegex: "label|lbl|tag|sticker|wash ?care|barcode|match it" },
    { id: "a-trim-pack", costingType: "ACTUAL", group: "Packaging", sectionKeys: ["TRIMS"], itemRegex: "carton|poly ?bag|master|divider|gum|strap|rfid" },
    { id: "a-trim-other", costingType: "ACTUAL", group: "Other", sectionKeys: ["TRIMS"], itemRegex: "fr[ie]+ght" },
    { id: "a-trim", costingType: "ACTUAL", group: "Trims", sectionKeys: ["TRIMS"] },
    // ── Client ──
    { id: "c-fab", costingType: "CLIENT", group: "Fabric", sectionKeys: ["fabric"] },
    { id: "c-sew", costingType: "CLIENT", group: "Trims", sectionKeys: ["sewing_trims"] },
    { id: "c-label", costingType: "CLIENT", group: "Labels & Tags", sectionKeys: ["label_and_tags"] },
    { id: "c-pack", costingType: "CLIENT", group: "Packaging", sectionKeys: ["packing_trims"] },
    { id: "c-emb", costingType: "CLIENT", group: "Embellishment", sectionKeys: ["emb", "print"] },
    { id: "c-cm", costingType: "CLIENT", group: "CMT", sectionKeys: ["cm"] },
    { id: "c-test", costingType: "CLIENT", group: "Other", sectionKeys: ["testing"] },
    { id: "c-rej", costingType: "CLIENT", group: "Garment Rejection", sectionKeys: ["garment_rejection"] },
    { id: "c-oh", costingType: "CLIENT", group: "Overhead + Margin", sectionKeys: ["overhead_margin"] },
  ],
  cadMappingRules: [
    {
      id: "client-main-fabric-qty",
      costingType: "CLIENT",
      target: { kind: "LINE_FIELD", field: "quantity", sectionKeys: ["fabric"], itemRegex: "^main fabric$" },
      cadField: "lengthPerSet",
      requireUomDimension: "length_m",
      note: "Client costing fabric quantity is per-garment consumption (source: Main Fabric 1.6 mtr × price 77 = 123.2). CAD Length per Set (m) feeds it.",
    },
    {
      id: "actual-consumption",
      costingType: "ACTUAL",
      target: { kind: "ACTUAL_CONSUMPTION" },
      cadField: "lengthPerSet",
      note: "Actual costing 'CONSUMPTION' (per piece, m). The fabric-order QTY is lot-level purchased metres and is never overwritten by CAD.",
    },
  ],
};
