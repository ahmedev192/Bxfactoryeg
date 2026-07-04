import { GlobalSettings, ScenarioType, StepType, VendorType } from '@prisma/client';
import { addWorkingDays, countWorkingDaysBetween, parseHolidays, parseWorkingDays } from './calendar';
import { PlanningConstraints } from './constraints';
import { VendorCandidate } from './statistics';

export interface SplitPart {
  vendorId: string;
  vendorName: string;
  splitPct: number;
  quantity: number;
  days: number;
  cost: number;
}

export interface StepAlternative {
  vendorId: string;
  vendorName: string;
  days: number;
  cost: number;
  score: number;
}

export interface StepSolution {
  stepOrder: number;
  stepType: StepType;
  vendorType: VendorType;
  vendorId: string;
  vendorName: string;
  days: number;
  cost: number;
  confidencePct: number;
  p50Days: number;
  p90Days: number;
  splits: SplitPart[];
  parallelGroup: number | null;
  alternatives: StepAlternative[];
}

export interface RouteSolution {
  steps: StepSolution[];
  totalDays: number;
  totalCost: number;
  certaintyPct: number;
  p50Days: number;
  p90Days: number;
  splitCount: number;
  meetsDeadline: boolean;
  deadlineRiskPct: number;
  vendorSummary: string;
}

const STEP_CHAIN: Array<{ stepType: StepType; vendorType: VendorType }> = [
  { stepType: StepType.FABRIC, vendorType: VendorType.FABRIC_SUPPLIER },
  { stepType: StepType.PRINT, vendorType: VendorType.PRINTING_PLACE },
  { stepType: StepType.FACTORY, vendorType: VendorType.FACTORY },
];

const SPLIT_PCT_STEP = 5;
const MAX_ENUMERATIONS = 1000;

function vendorCost(v: VendorCandidate, qty: number): number {
  return v.fixedCost + v.costPerUnit * qty;
}

function rankCandidates(
  candidates: VendorCandidate[],
  qty: number,
  type: ScenarioType,
  customWeights?: { time: number; cost: number; certainty: number }
): VendorCandidate[] {
  const maxDays = Math.max(...candidates.map((c) => c.processingDays), 1);
  const maxCost = Math.max(...candidates.map((c) => vendorCost(c, qty)), 1);

  const score = (v: VendorCandidate): number => {
    switch (type) {
      case ScenarioType.FASTEST_TIME:
        return v.processingDays;
      case ScenarioType.LOWEST_COST:
        return vendorCost(v, qty);
      case ScenarioType.MOST_RELIABLE: {
        const risk = (v.p90Days || v.processingDays) - v.processingDays;
        return (100 - v.confidencePct) * 10 + risk;
      }
      case ScenarioType.BALANCED:
      case ScenarioType.CUSTOM: {
        const w = customWeights || { time: 0.4, cost: 0.4, certainty: 0.2 };
        return (
          w.time * (v.processingDays / maxDays) +
          w.cost * (vendorCost(v, qty) / maxCost) +
          w.certainty * (1 - v.confidencePct / 100)
        );
      }
      default:
        return v.processingDays;
    }
  };

  return [...candidates].sort((a, b) => score(a) - score(b));
}

function generateTwoWaySplits(minPct: number): number[][] {
  const splits: number[][] = [];
  for (let pct = minPct; pct <= 100 - minPct; pct += SPLIT_PCT_STEP) {
    splits.push([pct, 100 - pct]);
  }
  return splits;
}

function generateThreeWaySplits(minPct: number): number[][] {
  const splits: number[][] = [];
  for (let a = minPct; a <= 100 - 2 * minPct; a += SPLIT_PCT_STEP) {
    for (let b = minPct; b <= 100 - a - minPct; b += SPLIT_PCT_STEP) {
      const c = 100 - a - b;
      if (c >= minPct) splits.push([a, b, c]);
    }
  }
  return splits;
}

function splitMeetsMoq(vendor: VendorCandidate, qty: number): boolean {
  if (vendor.moq == null || vendor.moq <= 0) return true;
  return qty >= vendor.moq;
}

export function optimizeSplits(
  candidates: VendorCandidate[],
  quantity: number,
  maxVendorsPerStep: number,
  type: ScenarioType,
  customWeights?: { time: number; cost: number; certainty: number }
): {
  primary: VendorCandidate;
  splits: SplitPart[];
  totalDays: number;
  totalCost: number;
  confidencePct: number;
  p50Days: number;
  p90Days: number;
} {
  const ranked = rankCandidates(candidates, quantity, type, customWeights);
  const splittable = ranked.filter((c) => c.isSplittable);
  const maxSplits = Math.min(
    maxVendorsPerStep,
    Math.max(...splittable.map((s) => s.maxSplits), 1),
    splittable.length
  );

  if (maxSplits < 2 || splittable.length < 2) {
    const v = ranked[0];
    return {
      primary: v,
      splits: [],
      totalDays: v.processingDays,
      totalCost: vendorCost(v, quantity),
      confidencePct: v.confidencePct,
      p50Days: v.p50Days || v.processingDays,
      p90Days: v.p90Days || v.processingDays,
    };
  }

  let best: ReturnType<typeof optimizeSplits> | null = null;
  let bestScore = Infinity;

  const evaluate = (vendors: VendorCandidate[], pcts: number[]) => {
    const parts: SplitPart[] = [];
    let totalCost = 0;
    let maxDays = 0;
    let p50 = 0;
    let p90 = 0;
    let confSum = 0;

    for (let i = 0; i < vendors.length; i++) {
      const qty = Math.round(quantity * (pcts[i] / 100));
      if (qty <= 0) return;
      if (!splitMeetsMoq(vendors[i], qty)) return;
      const days = vendors[i].processingDays;
      const cost = vendorCost(vendors[i], qty);
      parts.push({
        vendorId: vendors[i].id,
        vendorName: vendors[i].name,
        splitPct: pcts[i],
        quantity: qty,
        days,
        cost,
      });
      totalCost += cost;
      maxDays = Math.max(maxDays, days);
      p50 += vendors[i].p50Days || days;
      p90 += vendors[i].p90Days || days;
      confSum += vendors[i].confidencePct;
    }

    const remainder = quantity - parts.reduce((s, p) => s + p.quantity, 0);
    if (remainder !== 0 && parts.length) {
      parts[parts.length - 1].quantity += remainder;
      parts[parts.length - 1].cost = vendorCost(
        vendors[parts.length - 1],
        parts[parts.length - 1].quantity
      );
    }

    const routeScore =
      type === ScenarioType.FASTEST_TIME
        ? maxDays
        : type === ScenarioType.LOWEST_COST
          ? totalCost
          : maxDays * 0.5 + totalCost * 0.0001;

    if (routeScore < bestScore) {
      bestScore = routeScore;
      best = {
        primary: vendors[0],
        splits: parts,
        totalDays: maxDays,
        totalCost,
        confidencePct: confSum / vendors.length,
        p50Days: p50,
        p90Days: p90,
      };
    }
  };

  for (let n = 2; n <= maxSplits; n++) {
    const vendorCombos: VendorCandidate[][] = [];
    if (n === 2) {
      for (let i = 0; i < splittable.length; i++) {
        for (let j = i + 1; j < splittable.length; j++) {
          vendorCombos.push([splittable[i], splittable[j]]);
        }
      }
    } else if (n === 3) {
      for (let i = 0; i < splittable.length; i++) {
        for (let j = i + 1; j < splittable.length; j++) {
          for (let k = j + 1; k < splittable.length; k++) {
            vendorCombos.push([splittable[i], splittable[j], splittable[k]]);
          }
        }
      }
    }

    const minPct = Math.max(...splittable.map((s) => s.minSplitPct), 10);
    const pctAllocations = n === 2 ? generateTwoWaySplits(minPct) : generateThreeWaySplits(minPct);

    for (const combo of vendorCombos) {
      for (const pcts of pctAllocations) {
        evaluate(combo, pcts);
      }
    }
  }

  if (best) return best;

  const v = ranked[0];
  return {
    primary: v,
    splits: [],
    totalDays: v.processingDays,
    totalCost: vendorCost(v, quantity),
    confidencePct: v.confidencePct,
    p50Days: v.p50Days || v.processingDays,
    p90Days: v.p90Days || v.processingDays,
  };
}

function enumerateAssignments(pools: VendorCandidate[][]): VendorCandidate[][] {
  const combos: VendorCandidate[][] = [];
  const walk = (depth: number, current: VendorCandidate[]) => {
    if (combos.length >= MAX_ENUMERATIONS) return;
    if (depth === pools.length) {
      combos.push([...current]);
      return;
    }
    for (const v of pools[depth]) {
      current.push(v);
      walk(depth + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return combos;
}

export function scoreRoute(
  totalDays: number,
  totalCost: number,
  certaintyPct: number,
  type: ScenarioType,
  customWeights?: { time: number; cost: number; certainty: number }
): number {
  switch (type) {
    case ScenarioType.FASTEST_TIME:
      return totalDays;
    case ScenarioType.LOWEST_COST:
      return totalCost;
    case ScenarioType.MOST_RELIABLE:
      return 100 - certaintyPct;
    case ScenarioType.BALANCED:
    case ScenarioType.CUSTOM: {
      const w = customWeights || { time: 0.4, cost: 0.4, certainty: 0.2 };
      return w.time * totalDays + w.cost * (totalCost / 1000) + w.certainty * (100 - certaintyPct);
    }
    default:
      return totalDays;
  }
}

export function solveRoute(
  type: ScenarioType,
  pools: VendorCandidate[][],
  quantity: number,
  deadline: Date,
  enableSplits: boolean,
  constraints: PlanningConstraints,
  settings: GlobalSettings,
  customWeights?: { time: number; cost: number; certainty: number }
): RouteSolution {
  const workingDays = parseWorkingDays(settings);
  const holidays = parseHolidays(settings);
  const buffer = settings.transportBufferDays;
  const start = new Date();

  const rankedPools = pools.map((pool) => rankCandidates(pool, quantity, type, customWeights));
  const assignments = enumerateAssignments(rankedPools);

  let bestRoute: RouteSolution | null = null;
  let bestScore = Infinity;

  for (const assignment of assignments) {
    const stepSolutions: StepSolution[] = [];
    let cursor = new Date(start);
    let totalCost = 0;
    let splitCount = 0;
    let certaintySum = 0;
    let p50Sum = 0;
    let p90Sum = 0;

    for (let i = 0; i < STEP_CHAIN.length; i++) {
      const { stepType, vendorType } = STEP_CHAIN[i];
      const pool = rankedPools[i];
      const chosen = assignment[i];

      let vendor: VendorCandidate;
      let days: number;
      let cost: number;
      let splits: SplitPart[] = [];
      let confidencePct: number;
      let p50: number;
      let p90: number;

      if (enableSplits && constraints.enableSplits !== false) {
        const splitPool = pool.filter((c) => c.isSplittable);
        const splitResult = optimizeSplits(
          splitPool.length >= 2 ? splitPool : [chosen],
          quantity,
          constraints.maxVendorsPerStep,
          type,
          customWeights
        );
        vendor = splitResult.primary;
        days = splitResult.totalDays;
        cost = splitResult.totalCost;
        splits = splitResult.splits;
        confidencePct = splitResult.confidencePct;
        p50 = splitResult.p50Days;
        p90 = splitResult.p90Days;
        if (splits.length) splitCount += splits.length;
      } else {
        vendor = chosen;
        days = vendor.processingDays;
        cost = vendorCost(vendor, quantity);
        confidencePct = vendor.confidencePct;
        p50 = vendor.p50Days || days;
        p90 = vendor.p90Days || days;
      }

      const stepStart = addWorkingDays(cursor, 0, workingDays, holidays);
      const stepEnd = addWorkingDays(stepStart, days, workingDays, holidays, i > 0 ? buffer : 0);
      cursor = stepEnd;

      const alternatives: StepAlternative[] = pool.slice(0, constraints.maxVendorsPerStep).map((alt) => {
        const altCost = vendorCost(alt, quantity);
        return {
          vendorId: alt.id,
          vendorName: alt.name,
          days: alt.processingDays,
          cost: altCost,
          score: scoreRoute(alt.processingDays, altCost, alt.confidencePct, type, customWeights),
        };
      });

      stepSolutions.push({
        stepOrder: i + 1,
        stepType,
        vendorType,
        vendorId: vendor.id,
        vendorName: splits.length
          ? splits.map((s) => `${s.vendorName} (${s.splitPct}%)`).join(' + ')
          : vendor.name,
        days,
        cost,
        confidencePct,
        p50Days: p50,
        p90Days: p90,
        splits,
        parallelGroup: splits.length > 1 ? i + 1 : null,
        alternatives,
      });

      totalCost += cost;
      certaintySum += confidencePct;
      p50Sum += p50;
      p90Sum += p90;
    }

    const totalDays = countWorkingDaysBetween(start, cursor, workingDays, holidays);
    const meetsDeadline = cursor <= deadline;
    const slack = countWorkingDaysBetween(cursor, deadline, workingDays, holidays);
    const deadlineRiskPct = meetsDeadline
      ? Math.max(0, Math.min(30, 30 - slack * 3))
      : Math.min(99, 50 + Math.abs(slack) * 5);

    const routeScore = scoreRoute(
      Math.max(1, totalDays),
      totalCost,
      certaintySum / STEP_CHAIN.length,
      type,
      customWeights
    );

    if (routeScore < bestScore) {
      bestScore = routeScore;
      bestRoute = {
        steps: stepSolutions,
        totalDays: Math.max(1, totalDays),
        totalCost,
        certaintyPct: certaintySum / STEP_CHAIN.length,
        p50Days: p50Sum,
        p90Days: p90Sum,
        splitCount,
        meetsDeadline,
        deadlineRiskPct,
        vendorSummary: stepSolutions.map((s) => s.vendorName).join(' → '),
      };
    }
  }

  if (bestRoute) return bestRoute;

  throw new Error('لا يوجد مسار feasible بعد تطبيق القيود');
}
