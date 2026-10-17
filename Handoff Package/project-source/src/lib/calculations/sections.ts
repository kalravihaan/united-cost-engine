import type { ActualCosting, ClientCosting, CostLine, CostingDoc } from "@/types/costing";
import { slug } from "@/lib/normalization/labels";

/**
 * Header (section) level edits. Each mode starts with every row and header of its default template;
 * a header that a style does not need is removed for that style only. Removal never deletes data: the
 * header and its lines are flagged and can be restored.
 */

export function isSectionRemoved(doc: CostingDoc, key: string): boolean {
  return doc.type === "ACTUAL" ? !!doc.actual.removedSections?.includes(key) : !!doc.client.sections.find((s) => s.key === key)?.removed;
}

export function removeSection<T extends CostingDoc>(doc: T, key: string): T {
  const lines = doc.lines.map((l) => (l.sectionKey === key ? { ...l, removed: true } : l));
  if (doc.type === "ACTUAL") {
    const a = doc as ActualCosting;
    return { ...doc, lines, actual: { ...a.actual, removedSections: [...new Set([...(a.actual.removedSections ?? []), key])] } } as T;
  }
  const c = doc as ClientCosting;
  return { ...doc, lines, client: { ...c.client, sections: c.client.sections.map((s) => (s.key === key ? { ...s, removed: true } : s)) } } as T;
}

export function restoreSection<T extends CostingDoc>(doc: T, key: string): T {
  const lines = doc.lines.map((l) => (l.sectionKey === key ? { ...l, removed: false } : l));
  if (doc.type === "ACTUAL") {
    const a = doc as ActualCosting;
    return { ...doc, lines, actual: { ...a.actual, removedSections: (a.actual.removedSections ?? []).filter((k) => k !== key) } } as T;
  }
  const c = doc as ClientCosting;
  return { ...doc, lines, client: { ...c.client, sections: c.client.sections.map((s) => (s.key === key ? { ...s, removed: false } : s)) } } as T;
}

/** Client only: add a new cost-item category (header). */
export function addClientSection(doc: ClientCosting, label: string, phase: "MAIN" | "POST_TOTAL" = "MAIN"): ClientCosting {
  let key = slug(label) || "section";
  let n = 1;
  while (doc.client.sections.some((s) => s.key === key)) key = `${slug(label)}_${++n}`;
  // MAIN sections sit before the first POST_TOTAL one so they are summed into "Total"
  const sections = [...doc.client.sections];
  const firstPost = sections.findIndex((s) => s.phase === "POST_TOTAL");
  const at = phase === "MAIN" && firstPost >= 0 ? firstPost : sections.length;
  sections.splice(at, 0, { key, label, phase });
  return { ...doc, client: { ...doc.client, sections } };
}

/**
 * Template editing: removing is permanent there (the template defines which rows exist).
 * Drops flagged lines and removed headers.
 */
export function compactDoc<T extends CostingDoc>(doc: T): T {
  const dropped = new Set<string>();
  if (doc.type === "ACTUAL") for (const k of doc.actual.removedSections ?? []) dropped.add(k);
  else for (const s of doc.client.sections) if (s.removed) dropped.add(s.key);
  const lines: CostLine[] = doc.lines.filter((l) => !l.removed && !dropped.has(l.sectionKey));
  if (doc.type === "ACTUAL") return { ...doc, lines, actual: { ...doc.actual, removedSections: [] } } as T;
  return { ...doc, lines, client: { ...doc.client, sections: doc.client.sections.filter((s) => !s.removed) } } as T;
}

export function liveSections(doc: ClientCosting) {
  return doc.client.sections.filter((s) => !s.removed);
}
