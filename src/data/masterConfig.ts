/**
 * Declarative description of every master (Admin → Masters). Shared by the API (whitelist of
 * models/fields) and the UI (generic table + form), so adding a master is configuration.
 */
export type FieldType = "text" | "number" | "percent" | "boolean" | "ref" | "select" | "json";

export interface MasterField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** for ref: master name providing the options */
  ref?: string;
  options?: string[];
  readOnly?: boolean;
  /** column shown in the table */
  list?: boolean;
}

export interface MasterDef {
  name: string;
  label: string;
  model: "clientFormat" | "customer" | "brand" | "category" | "style" | "uom" | "costSection" | "costItem" | "fabricMaster" | "rateMaster" | "costingRule" | "styleAlias";
  description: string;
  /** primary text shown for a row (ref options) */
  display: string;
  orderBy: string;
  fields: MasterField[];
  /** rows cannot be created from the UI (they are created by imports / workflow) */
  noCreate?: boolean;
}

export const MASTERS: MasterDef[] = [
  {
    name: "customers", label: "Customers", model: "customer", display: "name", orderBy: "name",
    description: "Customer master. Starts empty: the source files contain no customer information.",
    fields: [
      { key: "name", label: "Name", type: "text", required: true, list: true },
      { key: "code", label: "Code", type: "text", list: true },
      { key: "clientFormatId", label: "Client costing layout", type: "ref", ref: "clientFormats", list: true },
      { key: "active", label: "Active", type: "boolean", list: true },
      { key: "notes", label: "Notes", type: "text" },
    ],
  },
  {
    name: "clientFormats", label: "Client layouts", model: "clientFormat", display: "label", orderBy: "label", noCreate: true,
    description: "Client-costing layouts (default rows, headers and price chain per customer/brand). Created on the Templates page by learning a reference workbook; a brand's layout wins over its customer's.",
    fields: [
      { key: "key", label: "Key", type: "text", readOnly: true, list: true },
      { key: "label", label: "Name", type: "text", required: true, list: true },
      { key: "active", label: "Active", type: "boolean", list: true },
    ],
  },
  {
    name: "brands", label: "Brands", model: "brand", display: "name", orderBy: "name",
    description: "Brands belong to a customer.",
    fields: [
      { key: "name", label: "Brand", type: "text", required: true, list: true },
      { key: "customerId", label: "Customer", type: "ref", ref: "customers", required: true, list: true },
      { key: "clientFormatId", label: "Client costing layout", type: "ref", ref: "clientFormats", list: true },
      { key: "active", label: "Active", type: "boolean", list: true },
    ],
  },
  {
    name: "categories", label: "Categories", model: "category", display: "name", orderBy: "name",
    description: "Style categories. Initial rows come from the client workbook's Overhead + margin table; the rate feeds the Overhead+Margin line.",
    fields: [
      { key: "name", label: "Category", type: "text", required: true, list: true },
      { key: "overheadMarginRate", label: "Overhead + Margin %", type: "percent", list: true },
      { key: "qty", label: "Qty (source header)", type: "number", list: true },
      { key: "source", label: "Source", type: "text", readOnly: true, list: true },
      { key: "active", label: "Active", type: "boolean", list: true },
    ],
  },
  {
    name: "styles", label: "Styles", model: "style", display: "number", orderBy: "number",
    description: "Style master and the style → customer / brand / category mapping (kept apart from the costing engine).",
    noCreate: true,
    fields: [
      { key: "number", label: "Style #", type: "text", required: true, readOnly: true, list: true },
      { key: "color", label: "Colour", type: "text", list: true },
      { key: "customerId", label: "Customer", type: "ref", ref: "customers", list: true },
      { key: "brandId", label: "Brand", type: "ref", ref: "brands", list: true },
      { key: "categoryId", label: "Category", type: "ref", ref: "categories", list: true },
      { key: "description", label: "Description", type: "text" },
    ],
  },
  {
    name: "mappings", label: "Mappings (aliases)", model: "styleAlias", display: "alias", orderBy: "alias",
    description: "Confirmed alternative names for a style (e.g. a client Product ID). Created only by explicit confirmation.",
    noCreate: true,
    fields: [
      { key: "alias", label: "Alias", type: "text", readOnly: true, list: true },
      { key: "styleId", label: "Style", type: "ref", ref: "styles", readOnly: true, list: true },
      { key: "source", label: "Source", type: "text", readOnly: true, list: true },
      { key: "confirmedBy", label: "Confirmed by", type: "text", readOnly: true, list: true },
    ],
  },
  {
    name: "uoms", label: "UOMs", model: "uom", display: "code", orderBy: "code",
    description: "Units of measure as used in the source files (kept verbatim: mtr, Piece, pcs, kg).",
    fields: [
      { key: "code", label: "Code", type: "text", required: true, list: true },
      { key: "name", label: "Name", type: "text", list: true },
      { key: "dimension", label: "Dimension (hint)", type: "text", list: true },
      { key: "source", label: "Source", type: "text", list: true },
      { key: "active", label: "Active", type: "boolean", list: true },
    ],
  },
  {
    name: "cost-categories", label: "Cost Categories", model: "costSection", display: "label", orderBy: "sortOrder",
    description: "Costing sections as named in the sources (actual: FABRIC ORDER / CMT / TRIMS …; client: Cost Item category + phase).",
    fields: [
      { key: "costingType", label: "Costing", type: "select", options: ["ACTUAL", "CLIENT"], required: true, list: true },
      { key: "key", label: "Key", type: "text", required: true, list: true },
      { key: "label", label: "Label", type: "text", required: true, list: true },
      { key: "phase", label: "Phase", type: "select", options: ["", "MAIN", "POST_TOTAL"], list: true },
      { key: "sortOrder", label: "Order", type: "number", list: true },
      { key: "active", label: "Active", type: "boolean", list: true },
    ],
  },
  {
    name: "cost-items", label: "Cost Items", model: "costItem", display: "name", orderBy: "name",
    description: "Cost item names seen in the sources, by section.",
    fields: [
      { key: "costingType", label: "Costing", type: "select", options: ["ACTUAL", "CLIENT"], required: true, list: true },
      { key: "sectionKey", label: "Section", type: "text", required: true, list: true },
      { key: "name", label: "Cost item", type: "text", required: true, list: true },
      { key: "defaultUom", label: "Default UOM", type: "text", list: true },
      { key: "itemType", label: "Item type", type: "text", list: true },
      { key: "source", label: "Source", type: "text", list: true },
      { key: "active", label: "Active", type: "boolean", list: true },
    ],
  },
  {
    name: "fabrics", label: "Fabric Masters", model: "fabricMaster", display: "name", orderBy: "name",
    description: "Fabrics observed in the imported costings (last seen rate is informational, never applied automatically).",
    fields: [
      { key: "name", label: "Fabric", type: "text", required: true, list: true },
      { key: "fabricType", label: "Type", type: "text", list: true },
      { key: "fabricFinish", label: "Finish", type: "text", list: true },
      { key: "construction", label: "Construction & content", type: "text", list: true },
      { key: "cuttableWidth", label: "Cuttable width", type: "text", list: true },
      { key: "defaultUom", label: "UOM", type: "text", list: true },
      { key: "lastRate", label: "Last rate", type: "number", list: true },
      { key: "source", label: "Source", type: "text", list: true },
    ],
  },
  {
    name: "rates", label: "Rate Masters", model: "rateMaster", display: "itemName", orderBy: "itemName",
    description: "Rates observed in the imported costings, by item.",
    fields: [
      { key: "costingType", label: "Costing", type: "select", options: ["ACTUAL", "CLIENT"], required: true, list: true },
      { key: "sectionKey", label: "Section", type: "text", required: true, list: true },
      { key: "itemName", label: "Item", type: "text", required: true, list: true },
      { key: "rate", label: "Rate", type: "number", required: true, list: true },
      { key: "uom", label: "UOM", type: "text", list: true },
      { key: "styleNumber", label: "Style", type: "text", list: true },
      { key: "source", label: "Source", type: "text", list: true },
    ],
  },
  {
    name: "rules", label: "Costing Rules", model: "costingRule", display: "ruleKey", orderBy: "sortOrder",
    description: "Comparison grouping rules (GROUP) and CAD → costing mapping rules (CAD_MAPPING). Edit the JSON payload; first matching GROUP rule wins by order.",
    fields: [
      { key: "kind", label: "Kind", type: "select", options: ["GROUP", "CAD_MAPPING"], required: true, list: true },
      { key: "ruleKey", label: "Rule key", type: "text", required: true, list: true },
      { key: "sortOrder", label: "Order", type: "number", list: true },
      { key: "payload", label: "Rule (JSON)", type: "json", required: true },
      { key: "active", label: "Active", type: "boolean", list: true },
    ],
  },
];

export const masterByName = (name: string) => MASTERS.find((m) => m.name === name);
