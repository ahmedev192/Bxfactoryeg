import {
  ScenarioType,
  StepType,
  VendorType,
} from '@prisma/client';
import { SCENARIO_LABELS } from '@production-ops/shared';
import { prisma } from '../lib/prisma';
import { addWorkingDays, countWorkingDaysBetween, parseHolidays, parseWorkingDays } from './calendar';
import { toNumber } from '../lib/utils';
import { applyConstraints, constraintsFromInput, ConstraintSnapshot } from './constraints';
import { getVendorCandidates, VendorCandidate } from './statistics';
import { solveRoute, StepSolution } from './solver';

export interface PlanningInput {
  orderId: string;
  runById: string;
  deadline: Date;
  quantity: number;
  fabricIds?: string[];
  printIds?: string[];
  factoryIds?: string[];
  enableSplits?: boolean;
  customWeights?: { time: number; cost: number; certainty: number };
  orderCategory?: string;
  requiredPrintType?: string;
}

export interface BuiltStep {
  stepOrder: number;
  stepType: StepType;
  vendorType: VendorType;
  vendorId: string;
  vendorName: string;
  startDate: Date;
  endDate: Date;
  days: number;
  cost: number;
  confidencePct: number;
  parallelGroup: number | null;
  splits: Array<{
    vendorId: string;
    vendorName: string;
    splitPct: number;
    quantity: number;
    days: number;
    cost: number;
  }>;
  alternatives: Array<{
    vendorId: string;
    vendorName: string;
    days: number;
    cost: number;
    score: number;
  }>;
}

export interface BuiltScenario {
  type: ScenarioType;
  totalDays: number;
  totalCost: number;
  certaintyPct: number;
  p50Days: number;
  p90Days: number;
  meetsDeadline: boolean;
  splitCount: number;
  deadlineRiskPct: number;
  vendorSummary: string;
  steps: BuiltStep[];
}

export interface ParetoPoint {
  scenarioId?: string;
  type: ScenarioType;
  label?: string;
  totalDays: number;
  totalCost: number;
  certaintyPct: number;
  isOnFrontier: boolean;
  dominatedBy: string[];
}

export interface DecisionGraphNode {
  id: string;
  label: string;
  type: string;
  selected?: boolean;
  alternative?: boolean;
  stepOrder?: number;
}

export interface DecisionGraphEdge {
  id: string;
  source: string;
  target: string;
  selected?: boolean;
  dashed?: boolean;
  label?: string;
}

export interface DecisionGraphStep {
  stepOrder: number;
  stepType: StepType;
  selected: { vendorId: string; vendorName: string; days: number; cost: number };
  alternatives: Array<{ vendorId: string; vendorName: string; days: number; cost: number }>;
}

export interface DecisionGraph {
  nodes: DecisionGraphNode[];
  edges: DecisionGraphEdge[];
  steps: DecisionGraphStep[];
}

function stepSolutionToBuiltStep(step: StepSolution, start: Date, end: Date): BuiltStep {
  return {
    stepOrder: step.stepOrder,
    stepType: step.stepType,
    vendorType: step.vendorType,
    vendorId: step.vendorId,
    vendorName: step.vendorName,
    startDate: start,
    endDate: end,
    days: step.days,
    cost: step.cost,
    confidencePct: step.confidencePct,
    parallelGroup: step.parallelGroup,
    splits: step.splits,
    alternatives: step.alternatives,
  };
}

async function buildScenario(
  type: ScenarioType,
  input: PlanningInput,
  pools: VendorCandidate[][],
  constraints: ReturnType<typeof constraintsFromInput>,
  settings: NonNullable<Awaited<ReturnType<typeof prisma.globalSettings.findUnique>>>
): Promise<BuiltScenario> {
  const workingDays = parseWorkingDays(settings);
  const holidays = parseHolidays(settings);
  const buffer = settings.transportBufferDays;
  const start = new Date();

  const solution = solveRoute(
    type,
    pools,
    input.quantity,
    input.deadline,
    Boolean(input.enableSplits),
    constraints,
    settings,
    input.customWeights
  );

  let cursor = new Date(start);
  const steps: BuiltStep[] = [];

  for (let i = 0; i < solution.steps.length; i++) {
    const step = solution.steps[i];
    const stepStart = addWorkingDays(cursor, 0, workingDays, holidays);
    const stepEnd = addWorkingDays(stepStart, step.days, workingDays, holidays, i > 0 ? buffer : 0);
    cursor = stepEnd;
    steps.push(stepSolutionToBuiltStep(step, stepStart, stepEnd));
  }

  return {
    type,
    totalDays: solution.totalDays,
    totalCost: solution.totalCost,
    certaintyPct: solution.certaintyPct,
    p50Days: solution.p50Days,
    p90Days: solution.p90Days,
    meetsDeadline: solution.meetsDeadline,
    splitCount: solution.splitCount,
    deadlineRiskPct: solution.deadlineRiskPct,
    vendorSummary: solution.vendorSummary,
    steps,
  };
}

export async function runPlanning(input: PlanningInput) {
  let settings = await prisma.globalSettings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    await prisma.globalSettings.create({ data: { id: 'default' } });
    settings = await prisma.globalSettings.findUnique({ where: { id: 'default' } });
  }
  const cfg = settings!;

  const defaultConfidence = toNumber(cfg.defaultConfidence);

  const [rawFabric, rawPrint, rawFactory] = await Promise.all([
    getVendorCandidates(VendorType.FABRIC_SUPPLIER, input.fabricIds, defaultConfidence),
    getVendorCandidates(VendorType.PRINTING_PLACE, input.printIds, defaultConfidence),
    getVendorCandidates(VendorType.FACTORY, input.factoryIds, defaultConfidence),
  ]);

  const constraints = constraintsFromInput(input, cfg.maxVendorsPerStep);
  const { fabric, print, factory, snapshot } = applyConstraints(
    rawFabric,
    rawPrint,
    rawFactory,
    constraints
  );

  if (!fabric.length || !print.length || !factory.length) {
    throw new Error('يجب توفر مورد نشط لكل مرحلة بعد تطبيق القيود (قماش، طباعة، مصنع)');
  }

  const pools = [fabric, print, factory];

  const types: ScenarioType[] = [
    ScenarioType.FASTEST_TIME,
    ScenarioType.LOWEST_COST,
    ScenarioType.BALANCED,
    ScenarioType.MOST_RELIABLE,
  ];
  if (input.customWeights) types.push(ScenarioType.CUSTOM);

  const built: BuiltScenario[] = [];
  for (const type of types) {
    built.push(await buildScenario(type, input, pools, constraints, cfg));
  }

  const constraintsPayload = {
    ...snapshot,
    fabricIds: input.fabricIds,
    printIds: input.printIds,
    factoryIds: input.factoryIds,
    enableSplits: Boolean(input.enableSplits),
    customWeights: input.customWeights,
    orderCategory: input.orderCategory,
    requiredPrintType: input.requiredPrintType,
    alternativesByScenario: Object.fromEntries(
      built.map((s) => [
        s.type,
        s.steps.map((step) =>
          step.alternatives.map(({ vendorId, vendorName, days, cost }) => ({
            vendorId,
            vendorName,
            days,
            cost,
          }))
        ),
      ])
    ),
  };

  const run = await prisma.planningRun.create({
    data: {
      orderId: input.orderId,
      runById: input.runById,
      deadline: input.deadline,
      quantity: input.quantity,
      customWeights: input.customWeights ? JSON.stringify(input.customWeights) : null,
      constraintsJson: JSON.stringify(constraintsPayload),
    },
  });

  const scenarios = [];
  for (const s of built) {
    const scenario = await prisma.scenario.create({
      data: {
        planningRunId: run.id,
        type: s.type,
        totalDays: s.totalDays,
        totalCost: s.totalCost,
        certaintyPct: s.certaintyPct,
        p50Days: s.p50Days,
        p90Days: s.p90Days,
        meetsDeadline: s.meetsDeadline,
        splitCount: s.splitCount,
        deadlineRiskPct: s.deadlineRiskPct,
        vendorSummary: s.vendorSummary,
        steps: {
          create: s.steps.map((step) => ({
            stepOrder: step.stepOrder,
            stepType: step.stepType,
            vendorType: step.vendorType,
            vendorId: step.vendorId,
            vendorName: step.vendorName,
            startDate: step.startDate,
            endDate: step.endDate,
            days: step.days,
            cost: step.cost,
            confidencePct: step.confidencePct,
            parallelGroup: step.parallelGroup,
            splits: step.splits.length
              ? { create: step.splits.map((sp) => ({ ...sp, splitPct: sp.splitPct })) }
              : undefined,
          })),
        },
      },
      include: { steps: { include: { splits: true }, orderBy: { stepOrder: 'asc' } } },
    });
    scenarios.push({ ...scenario, label: SCENARIO_LABELS[s.type] });
  }

  await prisma.order.update({
    where: { id: input.orderId },
    data: { deadline: input.deadline, status: 'PLANNED' },
  });

  return { run, scenarios };
}

export function scenarioToGraph(scenario: {
  steps: Array<{
    id: string;
    stepOrder: number;
    stepType: StepType;
    vendorName: string;
    days: number;
    cost: unknown;
    splits: Array<{ vendorName: string; splitPct: unknown }>;
  }>;
  type: ScenarioType;
  vendorSummary: string;
}) {
  const nodes: Array<{ id: string; label: string; type: string }> = [
    { id: 'start', label: 'بداية الطلب', type: 'start' },
  ];
  const edges: Array<{ id: string; source: string; target: string }> = [];

  scenario.steps.forEach((step, idx) => {
    const nodeId = `step-${step.id}`;
    const label = step.splits?.length
      ? step.splits.map((s) => `${s.vendorName} (${Number(s.splitPct)}%)`).join('\n')
      : step.vendorName;
    nodes.push({
      id: nodeId,
      label: `${step.stepType}: ${label}\n${step.days} يوم`,
      type: step.stepType.toLowerCase(),
    });
    const source = idx === 0 ? 'start' : `step-${scenario.steps[idx - 1].id}`;
    edges.push({ id: `e-${idx}`, source, target: nodeId });
  });

  const last = scenario.steps[scenario.steps.length - 1];
  if (last) {
    nodes.push({ id: 'end', label: 'اكتمال', type: 'end' });
    edges.push({ id: 'e-end', source: `step-${last.id}`, target: 'end' });
  }

  return { nodes, edges, scenarioType: scenario.type };
}

export function buildDecisionGraph(
  scenario: {
    id?: string;
    type: ScenarioType;
    steps: Array<{
      id: string;
      stepOrder: number;
      stepType: StepType;
      vendorId: string;
      vendorName: string;
      days: number;
      cost: unknown;
      splits?: Array<{ vendorName: string; splitPct: unknown }>;
    }>;
  },
  alternativesByStep?: Record<number, Array<{ vendorId: string; vendorName: string; days: number; cost: number }>>
): DecisionGraph {
  const nodes: DecisionGraphNode[] = [{ id: 'start', label: 'بداية', type: 'start', selected: true }];
  const edges: DecisionGraphEdge[] = [];
  const steps: DecisionGraphStep[] = [];

  let prevNodeId = 'start';

  for (const step of scenario.steps) {
    const alts =
      alternativesByStep?.[step.stepOrder] ||
      alternativesByStep?.[step.stepOrder - 1] ||
      [];

    const selectedNodeId = `step-${step.id}-selected`;
    nodes.push({
      id: selectedNodeId,
      label: `${step.stepType}: ${step.vendorName}\n${step.days} يوم`,
      type: step.stepType.toLowerCase(),
      selected: true,
      stepOrder: step.stepOrder,
    });
    edges.push({
      id: `e-${selectedNodeId}`,
      source: prevNodeId,
      target: selectedNodeId,
      selected: true,
    });

    steps.push({
      stepOrder: step.stepOrder,
      stepType: step.stepType,
      selected: {
        vendorId: step.vendorId,
        vendorName: step.vendorName,
        days: step.days,
        cost: Number(step.cost),
      },
      alternatives: alts.filter((a) => a.vendorId !== step.vendorId),
    });

    for (const alt of alts.filter((a) => a.vendorId !== step.vendorId)) {
      const altNodeId = `step-${step.id}-alt-${alt.vendorId}`;
      nodes.push({
        id: altNodeId,
        label: `${step.stepType}: ${alt.vendorName}\n${alt.days} يوم`,
        type: step.stepType.toLowerCase(),
        alternative: true,
        stepOrder: step.stepOrder,
      });
      edges.push({
        id: `e-${altNodeId}`,
        source: prevNodeId,
        target: altNodeId,
        dashed: true,
        label: `${alt.days}d / ${alt.cost}`,
      });
    }

    prevNodeId = selectedNodeId;
  }

  nodes.push({ id: 'end', label: 'اكتمال', type: 'end', selected: true });
  edges.push({ id: 'e-end', source: prevNodeId, target: 'end', selected: true });

  return { nodes, edges, steps };
}

export function computeParetoFrontier(
  scenarios: Array<{
    id?: string;
    type: ScenarioType;
    totalDays: number;
    totalCost: number | { toString(): string };
    certaintyPct: number | { toString(): string };
    label?: string;
  }>
): ParetoPoint[] {
  const normalized = scenarios.map((s) => ({
    scenarioId: s.id,
    type: s.type,
    label: s.label,
    totalDays: s.totalDays,
    totalCost: Number(s.totalCost),
    certaintyPct: Number(s.certaintyPct),
  }));

  const dominates = (
    a: (typeof normalized)[0],
    b: (typeof normalized)[0]
  ): boolean => {
    const aBetterOrEqual =
      a.totalDays <= b.totalDays &&
      a.totalCost <= b.totalCost &&
      a.certaintyPct >= b.certaintyPct;
    const strictlyBetter =
      a.totalDays < b.totalDays ||
      a.totalCost < b.totalCost ||
      a.certaintyPct > b.certaintyPct;
    return aBetterOrEqual && strictlyBetter;
  };

  return normalized.map((point) => {
    const dominatedBy = normalized
      .filter((other) => other.scenarioId !== point.scenarioId && dominates(other, point))
      .map((o) => o.scenarioId || o.type);

    return {
      ...point,
      isOnFrontier: dominatedBy.length === 0,
      dominatedBy,
    };
  });
}

export async function monteCarloDeadlineRisk(
  orderId: string,
  deadline: Date,
  iterations = 200
): Promise<number> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.selectedScenarioId) return 0;

  const scenario = await prisma.scenario.findUnique({
    where: { id: order.selectedScenarioId },
    include: { steps: { orderBy: { stepOrder: 'asc' } } },
  });
  if (!scenario) return 0;

  const settings = await prisma.globalSettings.findUnique({ where: { id: 'default' } });
  const settingsFallback = settings || ({ workingDaysJson: '[1,2,3,4,5]', holidaysJson: '[]' } as never);
  const workingDays = parseWorkingDays(settingsFallback);
  const holidays = parseHolidays(settingsFallback);
  const buffer = settings?.transportBufferDays ?? 1;

  let misses = 0;
  for (let i = 0; i < iterations; i++) {
    let cursor = new Date();
    for (let si = 0; si < scenario.steps.length; si++) {
      const step = scenario.steps[si];
      const variance = step.days * 0.15;
      const simulated = step.days + (Math.random() * 2 - 1) * variance;
      const days = Math.max(1, Math.round(simulated));
      const stepStart = addWorkingDays(cursor, 0, workingDays, holidays);
      cursor = addWorkingDays(stepStart, days, workingDays, holidays, si > 0 ? buffer : 0);
    }
    const workingSlack = countWorkingDaysBetween(cursor, deadline, workingDays, holidays);
    if (workingSlack < 0 || cursor > deadline) misses++;
  }
  return Math.round((misses / iterations) * 100);
}

void defaultConfidence;

export type { ConstraintSnapshot };

export {
  applyConstraints,
  constraintsFromInput,
  filterVendorsByMoq,
  filterVendorsByCapacity,
  filterVendorsByCategories,
  filterVendorsByPrintTypes,
  limitCandidatesPerStep,
  adjustDaysForCapacity,
  vendorMeetsMoq,
} from './constraints';
export type { PlanningConstraints, ExcludedVendor } from './constraints';

export { solveRoute, optimizeSplits, scoreRoute } from './solver';
export type { SplitPart, StepAlternative, StepSolution, RouteSolution } from './solver';
