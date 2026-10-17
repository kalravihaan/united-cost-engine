import { handle } from "@/server/http";
import { matchStyleNumber } from "@/services/styleService";

export const GET = handle(async (req) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const r = await matchStyleNumber(q);
  const slim = (m: NonNullable<typeof r.best>) => ({ id: m.candidate.id, number: m.candidate.number, confidence: m.confidence, reason: m.reason });
  return { status: r.status, query: r.query, message: r.message, best: r.best ? slim(r.best) : null, others: r.others.slice(0, 5).map(slim) };
});
