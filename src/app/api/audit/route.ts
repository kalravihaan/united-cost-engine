import { handle } from "@/server/http";
import { auditRepository } from "@/server/repositories/audit";

export const GET = handle(async (req) => {
  const sp = new URL(req.url).searchParams;
  const rows = await auditRepository.list({ styleId: sp.get("styleId") ?? undefined, take: 200 });
  return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
});
