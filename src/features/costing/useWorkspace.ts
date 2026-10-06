"use client";
import * as React from "react";
import type { ActualCosting, ActualResult, CadData, ClientCosting, ClientResult, CostingDoc, CostingResult, ValidationIssue } from "@/types/costing";
import type { RuleSet } from "@/types/rules";
import { applyCadToCosting, calculateActualCost, calculateClientCost, compareCostings, setLineField, type ComparisonResult } from "@/lib/calculations";
import { validateCosting } from "@/lib/validation/validate";
import { api, type VersionPayload, type Workspace } from "./api";
import { getUserName } from "./user";

export type CostingType = "ACTUAL" | "CLIENT";

export interface Pairing {
  type: CostingType;
  label: string;
  doc: CostingDoc;
}

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
  const [pairing, setPairing] = React.useState<Pairing | null>(null);
  const requestId = React.useRef(0);

  React.useEffect(() => {
    api.rules().then(setRules).catch(() => setRules(null));
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
      setLoading(true);
      setError(null);
      try {
        const w = await api.workspace(styleId);
        if (my !== requestId.current) return null;
        setPairing(null);
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
    setPairing(null);
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
      setDraft(type, v?.doc ?? null, v ? { id: v.id, versionNo: v.versionNo, historic: false } : null, 0);
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

  /* ───────── derived ───────── */
  const results = React.useMemo(() => {
    const out: { ACTUAL: ActualResult | null; CLIENT: ClientResult | null } = { ACTUAL: null, CLIENT: null };
    if (drafts.ACTUAL) out.ACTUAL = calculateActualCost(drafts.ACTUAL);
    if (drafts.CLIENT) out.CLIENT = calculateClientCost(drafts.CLIENT);
    return out;
  }, [drafts]);

  const cad: CadData | null = ws?.cad?.data ?? null;

  const comparison: { cmp: ComparisonResult; paired: boolean; label: string | null } | null = React.useMemo(() => {
    if (!rules) return null;
    const a = drafts.ACTUAL ?? (pairing?.type === "ACTUAL" ? (pairing.doc as ActualCosting) : null);
    const c = drafts.CLIENT ?? (pairing?.type === "CLIENT" ? (pairing.doc as ClientCosting) : null);
    if (!a || !c) return null;
    return { cmp: compareCostings(a, calculateActualCost(a), c, calculateClientCost(c), rules), paired: !(drafts.ACTUAL && drafts.CLIENT), label: pairing?.label ?? null };
  }, [drafts, pairing, rules]);

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

  return { ws, loading, error, drafts, dirty, loadedVersion, rules, results, cad, comparison, pairing, setPairing, loadStyle, refresh, clear, edit, discard, save, loadHistoric, validate, applyCad, applyCategory, setDraft, hydrate };
}

export type Workbench = ReturnType<typeof useWorkspace>;
export type { CostingResult };
