import { handle, readJson } from "@/server/http";
import { confirmAlias } from "@/services/styleService";

export const POST = handle<{ id: string }>(async (req, { params }, user) => {
  const b = await readJson<{ alias: string; source?: string }>(req);
  if (!b.alias?.trim()) throw new Error("Alias is required");
  const a = await confirmAlias({ styleId: params.id, alias: b.alias, source: b.source, user });
  return { id: a.id };
});
