import { handle } from "@/server/http";
import { loadStandardRates } from "@/services/standardRatesService";

/** Load (or refresh) the analysis's standard fabric and rate values into the masters. Idempotent. */
export const POST = handle(async (_req, _ctx, user) => loadStandardRates(user));
