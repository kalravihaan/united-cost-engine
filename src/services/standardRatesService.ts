import { prisma } from "@/server/db";
import { auditRepository } from "@/server/repositories/audit";
import { standardRateRows, STANDARD_SOURCE } from "@/lib/analysis/standardRates";

export interface LoadStandardRatesResult {
  fabrics: { added: number; updated: number; keptYours: number };
  rates: { replaced: number; added: number };
}

/**
 * Loads the analysis's standards into the Fabric and Rate masters. Safe to repeat:
 *  - rows whose source starts with "Standard rates" are refreshed (rates: replaced, fabrics: updated);
 *  - a fabric you created or edited under the same name (other source) is left untouched;
 *  - nothing is applied to any costing – masters stay reference data.
 */
export async function loadStandardRates(user: string): Promise<LoadStandardRatesResult> {
  const { fabrics, rates } = standardRateRows();
  const out: LoadStandardRatesResult = { fabrics: { added: 0, updated: 0, keptYours: 0 }, rates: { replaced: 0, added: 0 } };

  for (const f of fabrics) {
    const existing = await prisma.fabricMaster.findUnique({ where: { name: f.name } });
    if (!existing) {
      await prisma.fabricMaster.create({ data: f });
      out.fabrics.added++;
    } else if ((existing.source ?? "").startsWith(STANDARD_SOURCE)) {
      await prisma.fabricMaster.update({ where: { id: existing.id }, data: { fabricType: f.fabricType, defaultUom: f.defaultUom, lastRate: f.lastRate, source: f.source } });
      out.fabrics.updated++;
    } else out.fabrics.keptYours++;
  }

  const removed = await prisma.rateMaster.deleteMany({ where: { source: { startsWith: STANDARD_SOURCE } } });
  out.rates.replaced = removed.count;
  await prisma.rateMaster.createMany({ data: rates });
  out.rates.added = rates.length;

  await auditRepository.log({ userName: user, action: "MASTER_LOAD_STANDARD_RATES", entityType: "rates", details: out });
  return out;
}

/** Loads the standards only when none are in the masters yet (an older database or saved data file that predates them). */
export async function ensureStandardRates(user: string): Promise<LoadStandardRatesResult | null> {
  const present = await prisma.rateMaster.count({ where: { source: { startsWith: STANDARD_SOURCE } } });
  return present > 0 ? null : loadStandardRates(user);
}
