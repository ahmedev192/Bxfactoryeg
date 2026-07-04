import { VendorType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { toNumber } from '../lib/utils';

export interface VendorCandidate {
  id: string;
  name: string;
  processingDays: number;
  costPerUnit: number;
  fixedCost: number;
  confidencePct: number;
  isSplittable: boolean;
  minSplitPct: number;
  maxSplits: number;
  vendorType: VendorType;
  p50Days?: number;
  p90Days?: number;
  moq?: number | null;
  capacityPerDay?: number | null;
  categories?: string | null;
  printTypes?: string | null;
}

export async function getVendorCandidates(
  vendorType: VendorType,
  ids?: string[],
  defaultConfidence = 80
): Promise<VendorCandidate[]> {
  const map = async (rows: Array<Record<string, unknown>>) => {
    const result: VendorCandidate[] = [];
    for (const r of rows) {
      const stats = await prisma.vendorStatistics.findUnique({
        where: { vendorType_vendorId: { vendorType, vendorId: r.id as string } },
      });
      const baseDays = toNumber(r.processingDays);
      const stdDays = stats ? toNumber(stats.stdDays) : baseDays * 0.1;
      result.push({
        id: r.id as string,
        name: r.name as string,
        processingDays: stats ? toNumber(stats.meanDays) || baseDays : baseDays,
        costPerUnit: stats ? toNumber(stats.meanCost) || toNumber(r.costPerUnit) : toNumber(r.costPerUnit),
        fixedCost: toNumber(r.fixedCost),
        confidencePct: stats
          ? toNumber(stats.confidencePct)
          : toNumber(r.confidencePct) || defaultConfidence,
        isSplittable: r.isSplittable as boolean,
        minSplitPct: toNumber(r.minSplitPct),
        maxSplits: r.maxSplits as number,
        vendorType,
        p50Days: Math.round(baseDays),
        p90Days: Math.round(baseDays + stdDays * 1.28),
        moq: r.moq != null ? toNumber(r.moq) : null,
        capacityPerDay: r.capacityPerDay != null ? toNumber(r.capacityPerDay) : null,
        categories: (r.categories as string | null) ?? null,
        printTypes: (r.printTypes as string | null) ?? null,
      });
    }
    return result;
  };

  if (vendorType === VendorType.FACTORY) {
    const rows = await prisma.factory.findMany({
      where: { isActive: true, ...(ids?.length ? { id: { in: ids } } : {}) },
    });
    return map(rows as unknown as Record<string, unknown>[]);
  }
  if (vendorType === VendorType.PRINTING_PLACE) {
    const rows = await prisma.printingPlace.findMany({
      where: { isActive: true, ...(ids?.length ? { id: { in: ids } } : {}) },
    });
    return map(rows as unknown as Record<string, unknown>[]);
  }
  const rows = await prisma.fabricSupplier.findMany({
    where: { isActive: true, ...(ids?.length ? { id: { in: ids } } : {}) },
  });
  return map(rows as unknown as Record<string, unknown>[]);
}

export async function recalculateVendorStatistics(
  vendorType: VendorType,
  vendorId: string
) {
  const actuals = await prisma.actualPerformance.findMany({
    where: { vendorType, vendorId },
    orderBy: { recordedAt: 'desc' },
    take: 50,
  });
  if (!actuals.length) return;

  const n = actuals.length;
  const meanDays = actuals.reduce((s, a) => s + a.actualDays, 0) / n;
  const meanCost = actuals.reduce((s, a) => s + toNumber(a.actualCost), 0) / n;
  const varDays =
    actuals.reduce((s, a) => s + Math.pow(a.actualDays - meanDays, 2), 0) / n;
  const varCost =
    actuals.reduce((s, a) => s + Math.pow(toNumber(a.actualCost) - meanCost, 2), 0) / n;
  const stdDays = Math.sqrt(varDays);
  const stdCost = Math.sqrt(varCost);
  const confidencePct = Math.min(99, 50 + n * 5 - stdDays * 2);

  await prisma.vendorStatistics.upsert({
    where: { vendorType_vendorId: { vendorType, vendorId } },
    create: {
      vendorType,
      vendorId,
      sampleCount: n,
      meanDays,
      stdDays,
      meanCost,
      stdCost,
      confidencePct,
    },
    update: {
      sampleCount: n,
      meanDays,
      stdDays,
      meanCost,
      stdCost,
      confidencePct,
    },
  });
}

export async function getVendorScorecard() {
  const stats = await prisma.vendorStatistics.findMany({
    orderBy: { confidencePct: 'desc' },
    take: 20,
  });
  const enriched = await Promise.all(
    stats.map(async (s) => {
      let name = s.vendorId;
      if (s.vendorType === VendorType.FACTORY) {
        const f = await prisma.factory.findUnique({ where: { id: s.vendorId } });
        name = f?.name || name;
      } else if (s.vendorType === VendorType.PRINTING_PLACE) {
        const p = await prisma.printingPlace.findUnique({ where: { id: s.vendorId } });
        name = p?.name || name;
      } else {
        const f = await prisma.fabricSupplier.findUnique({ where: { id: s.vendorId } });
        name = f?.name || name;
      }
      return { ...s, vendorName: name };
    })
  );
  return enriched;
}
