import { handle } from "@/server/http";
import { prisma } from "@/server/db";

export const GET = handle(async () => {
  const rows = await prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((r) => ({ id: r.id, kind: r.kind, fileName: r.fileName, sheetCount: r.sheetCount, created: r.created, skipped: r.skipped, createdBy: r.createdBy, createdAt: r.createdAt.toISOString(), report: r.report }));
});
