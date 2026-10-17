"use client";
import * as React from "react";
import type { ActualCosting, ActualResult, CadData, ClientCosting, ClientResult, CostingDoc, CostingResult, ValidationIssue } from "@/types/costing";
import type { RuleSet } from "@/types/rules";
import { applyCadToCosting, calculateActualCost, calculateClientCost, compareCostings, createFromTemplate, setLineField, type ComparisonResult } from "@/lib/calculations";
import { validateCosting } from "@/lib/validation/validate";
import { api, type VersionPayload, type Workspace } from "./api";
import { getUserName } from "./user";

export type CostingType = "ACTUAL" | "CLIENT";

export interface CategoryOption {
  id: string;
  name: string;
  overheadMarginRate: number | null;
  source: string | null;
}

interface Drafts {
  ACTUAL: ActualCosting | null;
  CLIENT: ClientCosting | null;
}

const empty: Drafts = { ACTUAL: null, CLIENT: null };

export function useWorkspace() {
  const [ws, setWs] = React.useState<Workspace | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Drafts>(empty);
  const [dirty, setDirty] = React.useState<Record<CostingType, number>>({ ACTUAL: 0, CLIENT: 0 });
  const [loadedVersion, setLoadedVersion] = React.useState<Record<CostingType, { id: string; versionNo: number; historic: boolean } | null>>({ ACTUAL: null, CLIENT: null });
  const [rules, setRules] = React.useState<RuleSet | null>(null);
  const [templates, setTemplates] = React.useState<{ ACTUAL: CostingDoc | null; CLIENT: CostingDoc | null } | null>(null);
  /** client layouts that have a default template (DEFAULT + one per customer/brand format) */
  const [clientFormats, setClientFormats] = React.useState<Array<{ key: string; label: string }>>([]);
  const [clientTemplates, setClientTemplates] = React.useState<Record<string, CostingDoc>>({});
  /** layout picked by the user for a style that has no client costing yet (null = the style's brand/customer layout) */
  const [chosenFormat, setChosenFormat] = React.useState<string | null>(null);
  const requestId = React.useRef(0);

  React.useEffect(() => {
    api.rules().then(setRules).catch(() => setRules(null));
    (async () => {
      const [a, formats] = await Promise.all([api.template("ACTUAL").catch(() => null), api.clientFormats().catch(() => [] as Array<{ key: string; label: string }>)]);
      const docs: Record<string, CostingDoc> = {};
      await Promise.all(formats.map(async (f) => { const t = await api.template("CLIENT", f.key).catch(() => null); if (t) docs[f.key] = t.doc; }));
      setClientFormats(formats.filter((f) => docs[f.key]));
      setClientTemplates(docs);
      setTemplates({ ACTUAL: a?.doc ?? null, CLIENT: docs.DEFAULT ?? Object.values(docs)[0] ?? null });
    })();
  }, []);

  const hydrate = React.useCallback((w: Workspace, keepDrafts = false) => {
    setWs(w);
    if (!keepDrafts) {
      setDrafts({ ACTUAL: (w.actual?.doc as ActualCosting) ?? null, CLIENT: (w.client?.doc as ClientCosting) ?? null });
      setDirty({ ACTUAL: 0, CLIENT: 0 });
      setLoadedVersion({
        ACTUAL: w.actual ? { id: w.actual.id, versionNo: w.actual.versionNo, historic: false } : null,
        CLIENT: w.client ? { id: w.client.id, versionNo: w.client.versionNo, historic: false } : null,
      });
    }
  }, []);

  const loadStyle = React.useCallback(
    async (styleId: string) => {
      const my = ++requestId.current;
      setChosenFormat(null);
      setLoading(true);
      setError(null);
      try {
        const w = await api.workspace(styleId);
        if (my !== requestId.current) return null;
        hydrate(w);
        return w;
      } catch (e) {
        if (my === requestId.current) setError((e as Error).message);
        return null;
      } finally {
        if (my === requestId.current) setLoading(false);
      }
    },
    [hydrate],
  );

  const refresh = React.useCallback(
    async (keepDrafts = true) => {
      if (!ws) return null;
      const w = await api.workspace(ws.style.id);
      hydrate(w, keepDrafts);
      return w;
    },
    [ws, hydrate],
  );

  const clear = React.useCallback(() => {
    requestId.current++;
    setWs(null);
    setDrafts(empty);
    setDirty({ ACTUAL: 0, CLIENT: 0 });
    setLoadedVersion({ ACTUAL: null, CLIENT: null });
  }, []);

  /** Apply a pure document transformation to the working copy of one costing type. */
  const edit = React.useCallback(<T extends CostingDoc>(type: CostingType, fn: (d: T) => T) => {
    setDrafts((d) => {
      const cur = d[type] as unknown as T | null;
      if (!cur) return d;
      const next = fn(cur);
      if (next === cur) return d;
      return { ...d, [type]: next } as Drafts;
    });
    setDirty((x) => ({ ...x, [type]: x[type] + 1 }));
  }, []);

  const setDraft = React.useCallback((type: CostingType, doc: CostingDoc | null, version?: { id: string; versionNo: number; historic: boolean } | null, dirtyCount = 0) => {
    setDrafts((d) => ({ ...d, [type]: doc }) as Drafts);
    setDirty((x) => ({ ...x, [type]: dirtyCount }));
    if (version !== undefined) setLoadedVersion((v) => ({ ...v, [type]: version }));
  }, []);

  const discard = React.useCallback(
    (type: CostingType) => {
      const v = type === "ACTUAL" ? ws?.actual : ws?.client;
      if (v) setDraft(type, v.doc, { id: v.id, versionNo: v.versionNo, historic: false }, 0);
      else setDraft(type, null, null, 0); // new costing: the effect rebuilds it from the default template
    },
    [ws, setDraft],
  );

  const save = React.useCallback(
    async (type: CostingType, note?: string) => {
      if (!ws) throw new Error("No style selected");
      const doc = drafts[type];
      if (!doc) throw new Error("Nothing to save");
      const r = await api.save(ws.style.id, doc, note);
      const w = await api.workspace(ws.style.id);
      // keep other type's unsaved draft; replace this one with the stored version
      setWs(w);
      const v: VersionPayload | null = type === "ACTUAL" ? w.actual : w.client;
      setDraft(type, v?.doc ?? null, v ? { id: v.id, versionNo: v.versionNo, historic: false } : null, 0);
      return r;
    },
    [ws, drafts, setDraft],
  );

  const loadHistoric = React.useCallback(
    async (versionId: string) => {
      const v = await api.version(versionId);
      setDraft(v.type, v.doc, { id: v.id, versionNo: v.versionNo, historic: true }, 0);
      return v;
    },
    [setDraft],
  );

  const effectiveFormat = React.useMemo(() => {
    const want = chosenFormat ?? ws?.style.clientFormat ?? "DEFAULT";
    return clientTemplates[want] ? want : clientTemplates.DEFAULT ? "DEFAULT" : Object.keys(clientTemplates)[0] ?? "DEFAULT";
  }, [chosenFormat, ws?.style.clientFormat, clientTemplates]);

  /**
   * A style without a costing in a mode starts from that mode's default template: ALL its headers and rows,
   * no values. It is an unsaved draft until the user saves it as version 1.
   */
  const freshDraft = React.useCallback(
    (type: CostingType): CostingDoc | null => {
      const tpl = type === "CLIENT" ? clientTemplates[effectiveFormat] ?? templates?.CLIENT : templates?.[type];
      if (!tpl || !ws) return null;
      return createFromTemplate(tpl, { number: ws.style.number, label: ws.style.number, color: ws.style.color ?? undefined }, "STRUCTURE");
    },
    [templates, clientTemplates, effectiveFormat, ws],
  );

  /** Switch the layout of a client costing that has not been saved yet (starts it again from that layout's rows). */
  const setClientFormat = React.useCallback((key: string) => {
    setChosenFormat(key);
    setDrafts((d) => ({ ...d, CLIENT: null }));
    setDirty((x) => ({ ...x, CLIENT: 0 }));
  }, []);

  React.useEffect(() => {
    if (!ws || !templates) return;
    for (const type of ["ACTUAL", "CLIENT"] as const) {
      const stored = type === "ACTUAL" ? ws.actual : ws.client;
      if (!stored && !drafts[type]) {
        const d = freshDraft(type);
        if (d) {
          setDrafts((x) => ({ ...x, [type]: d }) as Drafts);
          setDirty((x) => ({ ...x, [type]: 1 }));
        }
      }
    }
  }, [ws, templates, drafts, freshDraft]);

  /* ───────── derived ───────── */
  const results = React.useMemo(() => {
    const out: { ACTUAL: ActualResult | null; CLIENT: ClientResult | null } = { ACTUAL: null, CLIENT: null };
    if (drafts.ACTUAL) out.ACTUAL = calculateActualCost(drafts.ACTUAL);
    if (drafts.CLIENT) out.CLIENT = calculateClientCost(drafts.CLIENT);
    return out;
  }, [drafts]);

  const cad: CadData | null = ws?.cad?.data ?? null;

  /** Actual vs Client of the SAME style, from the working copies (so it updates as values are entered). */
  const comparison: ComparisonResult | null = React.useMemo(() => {
    const a = drafts.ACTUAL;
    const c = drafts.CLIENT;
    if (!rules || !a || !c) return null;
    return compareCostings(a, calculateActualCost(a), c, calculateClientCost(c), rules);
  }, [drafts, rules]);

  const validate = React.useCallback(
    (type: CostingType): ValidationIssue[] =>
      validateCosting({ doc: drafts[type], enteredStyleNumber: ws?.style.number ?? "", customerId: ws?.style.customerId, brandId: ws?.style.brandId, cad, cadRequired: true }),
    [drafts, ws, cad],
  );

  /* ───────── CAD → costing ───────── */
  const applyCad = React.useCallback(
    (type: CostingType) => {
      const doc = drafts[type];
      if (!doc || !cad || !rules) return null;
      const out = applyCadToCosting(doc, cad, rules.cadMappingRules, { by: getUserName() });
      if (out.applied.length) {
        setDrafts((d) => ({ ...d, [type]: out.doc }) as Drafts);
        setDirty((x) => ({ ...x, [type]: x[type] + 1 }));
      }
      return out;
    },
    [drafts, cad, rules],
  );

  /** Category → Overhead+Margin rate (client). The tier rate is written as origin MASTER, overriding nothing silently. */
  const applyCategory = React.useCallback(
    (cat: CategoryOption | null) => {
      setDrafts((d) => {
        const doc = d.CLIENT;
        if (!doc) return d;
        let next: ClientCosting = { ...doc, client: { ...doc.client, category: cat?.name ?? null } };
        const oh = next.lines.find((l) => l.sectionKey === "overhead_margin" && !l.removed);
        if (cat && cat.overheadMarginRate !== null && oh) {
          next = setLineField(next, oh.id, "rate", cat.overheadMarginRate, { by: getUserName() }, "MASTER", { note: `Category “${cat.name}” → Overhead + margin table${cat.source ? ` (${cat.source})` : ""}` });
        }
        return { ...d, CLIENT: next };
      });
      setDirty((x) => ({ ...x, CLIENT: x.CLIENT + 1 }));
    },
    [],
  );

  return { clientFormats, clientFormat: effectiveFormat, setClientFormat, ws, loading, error, drafts, dirty, loadedVersion, rules, templates, results, cad, comparison, loadStyle, refresh, clear, edit, discard, save, loadHistoric, validate, applyCad, applyCategory, setDraft, hydrate };
}

export type Workbench = ReturnType<typeof useWorkspace>;
export type { CostingResult };
