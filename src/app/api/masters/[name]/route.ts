import { handle, readJson } from "@/server/http";
import { masterRepository } from "@/server/repositories/masters";
import { auditRepository } from "@/server/repositories/audit";

export const GET = handle<{ name: string }>(async (req, { params }) => {
  if (new URL(req.url).searchParams.get("options")) return masterRepository.options(params.name);
  return masterRepository.list(params.name);
});

export const POST = handle<{ name: string }>(async (req, { params }, user) => {
  const row = (await masterRepository.create(params.name, await readJson(req))) as { id: string };
  await auditRepository.log({ userName: user, action: "MASTER_CREATE", entityType: params.name, entityId: row.id, details: {} });
  return row;
});
