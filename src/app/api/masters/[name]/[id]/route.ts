import { handle, readJson } from "@/server/http";
import { masterRepository } from "@/server/repositories/masters";
import { auditRepository } from "@/server/repositories/audit";

export const PATCH = handle<{ name: string; id: string }>(async (req, { params }, user) => {
  const input = await readJson(req);
  const row = await masterRepository.update(params.name, params.id, input);
  await auditRepository.log({ userName: user, action: "MASTER_UPDATE", entityType: params.name, entityId: params.id, details: { fields: Object.keys(input) } });
  return row;
});

export const DELETE = handle<{ name: string; id: string }>(async (_req, { params }, user) => {
  if (params.name !== "mappings") throw new Error("Masters are deactivated, not deleted");
  await masterRepository.removeAlias(params.id);
  await auditRepository.log({ userName: user, action: "ALIAS_REMOVE", entityType: "mappings", entityId: params.id, details: {} });
  return { ok: true };
});
