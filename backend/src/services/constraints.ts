import { VendorType } from '@prisma/client';
import { VendorCandidate } from './statistics';

export interface PlanningConstraints {
  quantity: number;
  maxVendorsPerStep: number;
  orderCategory?: string;
  requiredPrintType?: string;
  fabricIds?: string[];
  printIds?: string[];
  factoryIds?: string[];
  enableSplits?: boolean;
}

export interface ExcludedVendor {
  vendorId: string;
  vendorName: string;
  vendorType: VendorType;
  reason: string;
}

export interface ConstraintSnapshot extends PlanningConstraints {
  filteredCounts: { fabric: number; print: number; factory: number };
  rawCounts: { fabric: number; print: number; factory: number };
  excluded: ExcludedVendor[];
}

function parseTagList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* fall through */
  }
  return raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

function matchesTagList(raw: string | null | undefined, required?: string): boolean {
  if (!required) return true;
  const tags = parseTagList(raw);
  if (!tags.length) return true;
  const needle = required.toLowerCase();
  return tags.some((t) => t.toLowerCase() === needle || t.toLowerCase().includes(needle));
}

export function adjustDaysForCapacity(vendor: VendorCandidate, quantity: number): number {
  if (!vendor.capacityPerDay || vendor.capacityPerDay <= 0) return vendor.processingDays;
  const throughputDays = Math.ceil(quantity / vendor.capacityPerDay);
  return Math.max(vendor.processingDays, throughputDays);
}

export function vendorMeetsMoq(vendor: VendorCandidate, quantity: number): boolean {
  if (vendor.moq == null || vendor.moq <= 0) return true;
  return quantity >= vendor.moq;
}

export function filterVendorsByMoq(
  vendors: VendorCandidate[],
  quantity: number,
  excluded: ExcludedVendor[]
): VendorCandidate[] {
  return vendors.filter((v) => {
    if (vendorMeetsMoq(v, quantity)) return true;
    excluded.push({
      vendorId: v.id,
      vendorName: v.name,
      vendorType: v.vendorType,
      reason: `الحد الأدنى للطلب ${v.moq} > الكمية ${quantity}`,
    });
    return false;
  });
}

export function filterVendorsByCapacity(
  vendors: VendorCandidate[],
  quantity: number
): VendorCandidate[] {
  return vendors.map((v) => ({
    ...v,
    processingDays: adjustDaysForCapacity(v, quantity),
    p50Days: adjustDaysForCapacity(v, quantity),
    p90Days: Math.round(adjustDaysForCapacity(v, quantity) * 1.2),
  }));
}

export function filterVendorsByCategories(
  vendors: VendorCandidate[],
  orderCategory: string | undefined,
  excluded: ExcludedVendor[]
): VendorCandidate[] {
  if (!orderCategory) return vendors;
  return vendors.filter((v) => {
    if (matchesTagList(v.categories, orderCategory)) return true;
    excluded.push({
      vendorId: v.id,
      vendorName: v.name,
      vendorType: v.vendorType,
      reason: `لا يطابق التصنيف "${orderCategory}"`,
    });
    return false;
  });
}

export function filterVendorsByPrintTypes(
  vendors: VendorCandidate[],
  requiredPrintType: string | undefined,
  excluded: ExcludedVendor[]
): VendorCandidate[] {
  if (!requiredPrintType) return vendors;
  return vendors.filter((v) => {
    if (matchesTagList(v.printTypes, requiredPrintType)) return true;
    excluded.push({
      vendorId: v.id,
      vendorName: v.name,
      vendorType: v.vendorType,
      reason: `لا يدعم نوع الطباعة "${requiredPrintType}"`,
    });
    return false;
  });
}

export function limitCandidatesPerStep(
  vendors: VendorCandidate[],
  maxVendorsPerStep: number
): VendorCandidate[] {
  if (maxVendorsPerStep <= 0) return vendors;
  return vendors.slice(0, maxVendorsPerStep);
}

export function applyConstraints(
  fabric: VendorCandidate[],
  print: VendorCandidate[],
  factory: VendorCandidate[],
  constraints: PlanningConstraints
): {
  fabric: VendorCandidate[];
  print: VendorCandidate[];
  factory: VendorCandidate[];
  snapshot: ConstraintSnapshot;
} {
  const excluded: ExcludedVendor[] = [];
  const rawCounts = { fabric: fabric.length, print: print.length, factory: factory.length };

  let filteredFabric = filterVendorsByMoq(fabric, constraints.quantity, excluded);
  filteredFabric = filterVendorsByCapacity(filteredFabric, constraints.quantity);
  filteredFabric = limitCandidatesPerStep(filteredFabric, constraints.maxVendorsPerStep);

  let filteredPrint = filterVendorsByMoq(print, constraints.quantity, excluded);
  filteredPrint = filterVendorsByPrintTypes(filteredPrint, constraints.requiredPrintType, excluded);
  filteredPrint = limitCandidatesPerStep(filteredPrint, constraints.maxVendorsPerStep);

  let filteredFactory = filterVendorsByMoq(factory, constraints.quantity, excluded);
  filteredFactory = filterVendorsByCategories(filteredFactory, constraints.orderCategory, excluded);
  filteredFactory = filterVendorsByCapacity(filteredFactory, constraints.quantity);
  filteredFactory = limitCandidatesPerStep(filteredFactory, constraints.maxVendorsPerStep);

  return {
    fabric: filteredFabric,
    print: filteredPrint,
    factory: filteredFactory,
    snapshot: {
      ...constraints,
      rawCounts,
      filteredCounts: {
        fabric: filteredFabric.length,
        print: filteredPrint.length,
        factory: filteredFactory.length,
      },
      excluded,
    },
  };
}

export function constraintsFromInput(
  input: {
    quantity: number;
    fabricIds?: string[];
    printIds?: string[];
    factoryIds?: string[];
    enableSplits?: boolean;
    orderCategory?: string;
    requiredPrintType?: string;
  },
  maxVendorsPerStep: number
): PlanningConstraints {
  return {
    quantity: input.quantity,
    maxVendorsPerStep,
    fabricIds: input.fabricIds,
    printIds: input.printIds,
    factoryIds: input.factoryIds,
    enableSplits: input.enableSplits,
    orderCategory: input.orderCategory,
    requiredPrintType: input.requiredPrintType,
  };
}
