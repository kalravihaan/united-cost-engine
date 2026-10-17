import { handle } from "@/server/http";
import { ensureStandardRates, loadStandardRates } from "@/services/standardRatesService";

/** Load (or refresh) the analysis's standard fabric and rate values into the masters. Idempotent. */
export const POST = handle(async (req, _ctx, user) => {
  // ?ifMissing=1: only when no standard rows exist yet (answers { loaded: null } otherwise)
  if (new URL(req.url).searchParams.get("ifMissing")) return { loaded: await ensureStandardRates(user) };
  return loadStandardRates(user);
});
