import type { CadData, CostingDoc, CostingResult } from "@/types/costing";
import type { RuleSet } from "@/types/rules";
import { getUserName } from "./user";

export interface ApiError extends Error {
  status: number;
}

async function req<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-user", getUserName());
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* not json */
    }
    const e = new Error(msg) as ApiError;
    e.status = res.status;
    throw e;
  }
  return res.json() as Promise<T>;
}

export interface VersionPayload {
  id: string;
  versionNo: number;
  sourceKind: string;
  sourceFile: string | null;
  sourceSheet: string | null;
  createdBy: string;
  createdAt: string;
  note: string | null;
  doc: CostingDoc;
  result: CostingResult;
  engineVersion: string;
}

export interface Workspace {
  style: { id: string; number: string; color: string | null; description: string | null; customerId: string | null; brandId: string | null; categoryId: string | null; customer: string | null; brand: string | null; category: string | null; aliases: string[] };
  imageUrl: string | null;
  cadFileUrl: string | null;
  cadPreviewUrl: string | null;
  cad: { id: string; revision: number; data: CadData; createdAt: string; createdBy: string } | null;
  actual: VersionPayload | null;
  client: VersionPayload | null;
}

export interface MatchResult {
  status: "EXACT" | "POSSIBLE" | "NONE";
  query: string;
  message: string;
  best: { id: string; number: string; confidence: number; reason: string } | null;
  others: Array<{ id: string; number: string; confidence: number; reason: string }>;
}

export interface StyleRow {
  id: string;
  number: string;
  color: string | null;
  description: string | null;
  customer: string | null;
  brand: string | null;
  category: string | null;
  customerId: string | null;
  brandId: string | null;
  categoryId: string | null;
  costings: Array<{ type: "ACTUAL" | "CLIENT"; versionNo: number; costPerPc: number | null; totalCost: number | null; sourceKind: string | null }>;
}

export interface VersionRow {
  id: string;
  versionNo: number;
  sourceKind: string;
  sourceFile: string | null;
  sourceSheet: string | null;
  totalCost: number | null;
  costPerPc: number | null;
  finalPoPrice: number | null;
  changedFields: Array<{ path: string; before: unknown; after: unknown }>;
  note: string | null;
  createdBy: string;
  createdAt: string;
  engineVersion: string;
}

export interface AuditRow {
  id: string;
  at: string;
  userName: string;
  action: string;
  entityType: string;
  details: Record<string, unknown>;
}

export const api = {
  styles: (q?: string) => req<StyleRow[]>(`/api/styles${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  match: (q: string) => req<MatchResult>(`/api/styles/match?q=${encodeURIComponent(q)}`),
  workspace: (id: string) => req<Workspace>(`/api/styles/${id}/workspace`),
  createStyle: (b: { number: string; customerId?: string | null; brandId?: string | null; categoryId?: string | null }) => req<{ id: string; number: string }>("/api/styles", { method: "POST", body: JSON.stringify(b) }),
  updateMapping: (id: string, b: { customerId?: string | null; brandId?: string | null; categoryId?: string | null }) => req<{ id: string }>(`/api/styles/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  confirmAlias: (id: string, alias: string, source?: string) => req<{ id: string }>(`/api/styles/${id}/alias`, { method: "POST", body: JSON.stringify({ alias, source }) }),
  uploadImage: (id: string, file: File) => {
    const f = new FormData();
    f.set("file", file);
    return req<{ fileId: string; url: string }>(`/api/styles/${id}/image`, { method: "POST", body: f });
  },
  uploadCad: (id: string, file: File) => {
    const f = new FormData();
    f.set("file", file);
    return req<{ id: string; revision: number; data: CadData }>(`/api/styles/${id}/cad`, { method: "POST", body: f });
  },
  editCad: (id: string, field: string, value: number | string | null, reason?: string) => req<{ id: string; revision: number; data: CadData }>(`/api/styles/${id}/cad`, { method: "PATCH", body: JSON.stringify({ field, value, reason }) }),
  save: (styleId: string, doc: CostingDoc, note?: string) => req<{ unchanged: boolean; version: VersionPayload }>("/api/costings", { method: "POST", body: JSON.stringify({ styleId, doc, note }) }),
  start: (b: { styleId: string; type: "ACTUAL" | "CLIENT"; templateStyleId: string; mode: "STRUCTURE" | "VALUES" }) => req<{ version: VersionPayload }>("/api/costings/start", { method: "POST", body: JSON.stringify(b) }),
  templates: (type: "ACTUAL" | "CLIENT") => req<Array<{ styleId: string; styleNumber: string; color: string | null; versionNo: number; costPerPc: number | null }>>(`/api/templates?type=${type}`),
  versions: (styleId: string, type: "ACTUAL" | "CLIENT") => req<VersionRow[]>(`/api/styles/${styleId}/versions?type=${type}`),
  version: (id: string) => req<VersionPayload & { styleId: string; styleNumber: string; type: "ACTUAL" | "CLIENT" }>(`/api/versions/${id}`),
  rules: () => req<RuleSet>("/api/rules"),
  audit: (styleId: string) => req<AuditRow[]>(`/api/audit?styleId=${styleId}`),
  masterOptions: (name: string) => req<Array<{ id: string; label: string }>>(`/api/masters/${name}?options=1`),
  masterList: (name: string) => req<Array<Record<string, unknown>>>(`/api/masters/${name}`),
  masterCreate: (name: string, b: Record<string, unknown>) => req<Record<string, unknown>>(`/api/masters/${name}`, { method: "POST", body: JSON.stringify(b) }),
  masterUpdate: (name: string, id: string, b: Record<string, unknown>) => req<Record<string, unknown>>(`/api/masters/${name}/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  masterDelete: (name: string, id: string) => req<{ ok: true }>(`/api/masters/${name}/${id}`, { method: "DELETE" }),
  template: (type: "ACTUAL" | "CLIENT") => req<{ type: string; version: number; doc: CostingDoc; source: string | null; updatedBy: string; updatedAt: string }>(`/api/cost-templates/${type}`),
  saveTemplate: (type: "ACTUAL" | "CLIENT", doc: CostingDoc) => req<{ version: number }>(`/api/cost-templates/${type}`, { method: "PUT", body: JSON.stringify({ doc }) }),
  rebuildTemplate: (type: "ACTUAL" | "CLIENT", file: File) => {
    const f = new FormData();
    f.set("file", file);
    return req<{ type: string; version: number; lines: number; sections: number }>(`/api/cost-templates/${type}/rebuild`, { method: "POST", body: f });
  },
};
