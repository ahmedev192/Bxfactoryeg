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
  workflowId?: string;
  enabledStageIds?: string[];
  candidateProcessIdsByStage?: Record<string, string[]>;
  splitSharesByStage?: Record<string, Record<string, number>>;
  monteCarloTrials?: number;
  maxScenarios?: number;
}

export interface BuiltStep {
  stepOrder: number;
  stepType: StepType;
  vendorType: VendorType;
  vendorId: string;
  vendorName: string;
  stageId?: string;
  stageName?: string;
  startDate: Date;
  endDate: Date;
  p95EndDate?: Date;
  days: number;
  cost: number;
  confidencePct: number;
  parallelGroup: number | null;
  isCritical?: boolean;
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

function processDuration(
  process: {
    timeOptimistic: unknown;
    timeMostLikely: unknown;
    timePessimistic: unknown;
    thresholds: Array<{ minQty: number; addDays: unknown }>;
  },
  quantity: number,
  percentile: 'p50' | 'p90' | 'p95' = 'p50'
) {
  const optimistic = toNumber(process.timeOptimistic);
  const mostLikely = toNumber(process.timeMostLikely);
  const pessimistic = toNumber(process.timePessimistic);
  const thresholdBump = process.thresholds
    .filter((t) => quantity >= t.minQty)
    .reduce((max, t) => Math.max(max, toNumber(t.addDays)), 0);
  const pert = (optimistic + 4 * mostLikely + pessimistic) / 6;
  const spread = Math.max(0, pessimistic - optimistic);
  const raw =
    percentile === 'p95'
      ? pert + spread * 0.45
      : percentile === 'p90'
        ? pert + spread * 0.35
        : pert;
  return Math.max(1, Math.ceil(raw + thresholdBump));
}

function processCost(process: { cost: unknown; costType: string }, quantity: number) {
  const cost = toNumber(process.cost);
  return process.costType === 'FIXED' ? cost : cost * quantity;
}

function scoreProcess(
  process: {
    timeOptimistic: unknown;
    timeMostLikely: unknown;
    timePessimistic: unknown;
    thresholds: Array<{ minQty: number; addDays: unknown }>;
    cost: unknown;
    costType: string;
    confidencePct: unknown;
  },
  quantity: number,
  type: ScenarioType,
  customWeights?: { time: number; cost: number; certainty: number }
) {
  const days = processDuration(process, quantity);
  const cost = processCost(process, quantity);
  const confidencePct = toNumber(process.confidencePct);
  if (type === ScenarioType.FASTEST_TIME) return days;
  if (type === ScenarioType.LOWEST_COST) return cost;
  if (type === ScenarioType.MOST_RELIABLE) return 100 - confidencePct;
  const weights = customWeights || { time: 0.4, cost: 0.4, certainty: 0.2 };
  return weights.time * days + weights.cost * (cost / 1000) + weights.certainty * (100 - confidencePct);
}

async function runWorkflowPlanning(input: PlanningInput) {
  if (!input.workflowId) throw new Error('workflowId مطلوب للتخطيط العام');
  let settings = await prisma.globalSettings.findUnique({ where: { id: 'default' } });
  if (!settings) settings = await prisma.globalSettings.create({ data: { id: 'default' } });
  const workingDays = parseWorkingDays(settings);
  const holidays = parseHolidays(settings);
  const buffer = settings.transportBufferDays;
  const enabled = input.enabledStageIds ? new Set(input.enabledStageIds) : null;

  const workflow = await prisma.workflowTemplate.findUnique({
    where: { id: input.workflowId },
    include: {
      steps: {
        orderBy: { sortOrder: 'asc' },
        include: {
          stages: {
            orderBy: { sortOrder: 'asc' },
            include: {
              stage: {
                include: {
                  processResources: {
                    where: { isActive: true },
                    include: { thresholds: { orderBy: { minQty: 'asc' } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!workflow || !workflow.isActive) throw new Error('قالب سير العمل غير موجود أو غير مفعل');

  const types: ScenarioType[] = [
    ScenarioType.FASTEST_TIME,
    ScenarioType.LOWEST_COST,
    ScenarioType.BALANCED,
    ScenarioType.MOST_RELIABLE,
  ];
  if (input.customWeights) types.push(ScenarioType.CUSTOM);

  const start = new Date();

  const built = types.slice(0, input.maxScenarios || types.length).map((type): BuiltScenario => {
    let cursor = new Date(start);
    let totalCost = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;
    let splitCount = 0;
    let p50Days = 0;
    let p90Days = 0;
    const steps: BuiltStep[] = [];

    for (const workflowStep of workflow.steps) {
      const memberships = workflowStep.stages.filter((membership) => !enabled || enabled.has(membership.stageId));
      if (!memberships.length) continue;

      const stepStart = addWorkingDays(cursor, 0, workingDays, holidays);
      const stageResults = memberships.map((membership) => {
        const allowedIds = input.candidateProcessIdsByStage?.[membership.stageId];
        const candidates = membership.stage.processResources.filter((process) => !allowedIds?.length || allowedIds.includes(process.id));
        if (!candidates.length) {
          throw new Error(`لا توجد موارد نشطة للمرحلة: ${membership.stage.name}`);
        }

        const shares = input.splitSharesByStage?.[membership.stageId];
        if (shares && Object.keys(shares).length > 1) {
          const selected = candidates.filter((process) => shares[process.id] != null);
          const pctTotal = selected.reduce((sum, process) => sum + Number(shares[process.id] || 0), 0);
          if (Math.round(pctTotal) !== 100) throw new Error(`نسب التقسيم للمرحلة ${membership.stage.name} يجب أن تساوي 100%`);
          if (selected.some((process) => !process.isSplittable)) throw new Error(`كل موارد التقسيم في ${membership.stage.name} يجب أن تكون قابلة للتقسيم`);

          const parts = selected.map((process) => {
            const splitPct = Number(shares[process.id]);
            const splitQty = Math.round(input.quantity * (splitPct / 100));
            const days = processDuration(process, splitQty);
            return {
              vendorId: process.id,
              vendorName: process.name,
              splitPct,
              quantity: splitQty,
              days,
              cost: processCost(process, splitQty),
            };
          });
          const days = Math.max(...parts.map((part) => part.days));
          const cost = parts.reduce((sum, part) => sum + part.cost, 0);
          const confidencePct = selected.reduce((sum, process) => sum + toNumber(process.confidencePct), 0) / selected.length;
          splitCount += parts.length;
          return {
            process: selected[0],
            vendorName: parts.map((part) => `${part.vendorName} (${part.splitPct}%)`).join(' + '),
            days,
            cost,
            confidencePct,
            p90: Math.max(...selected.map((process) => processDuration(process, input.quantity, 'p90'))),
            p95: Math.max(...selected.map((process) => processDuration(process, input.quantity, 'p95'))),
            splits: parts,
            alternatives: candidates.map((process) => ({
              vendorId: process.id,
              vendorName: process.name,
              days: processDuration(process, input.quantity),
              cost: processCost(process, input.quantity),
              score: scoreProcess(process, input.quantity, type, input.customWeights),
            })),
            membership,
          };
        }

        const ranked = [...candidates].sort(
          (a, b) => scoreProcess(a, input.quantity, type, input.customWeights) - scoreProcess(b, input.quantity, type, input.customWeights)
        );
        const process = ranked[0];
        const days = processDuration(process, input.quantity);
        return {
          process,
          vendorName: process.name,
          days,
          cost: processCost(process, input.quantity),
          confidencePct: toNumber(process.confidencePct),
          p90: processDuration(process, input.quantity, 'p90'),
          p95: processDuration(process, input.quantity, 'p95'),
          splits: [],
          alternatives: ranked.slice(0, settings.maxVendorsPerStep).map((alt) => ({
            vendorId: alt.id,
            vendorName: alt.name,
            days: processDuration(alt, input.quantity),
            cost: processCost(alt, input.quantity),
            score: scoreProcess(alt, input.quantity, type, input.customWeights),
          })),
          membership,
        };
      });

      const stepDays = Math.max(...stageResults.map((result) => result.days));
      const stepP90 = Math.max(...stageResults.map((result) => result.p90));
      const stepEnd = addWorkingDays(stepStart, stepDays, workingDays, holidays, steps.length ? buffer : 0);
      cursor = stepEnd;
      p50Days += stepDays;
      p90Days += stepP90;

      for (const result of stageResults) {
        totalCost += result.cost;
        confidenceSum += result.confidencePct;
        confidenceCount += 1;
        steps.push({
          stepOrder: workflowStep.sortOrder,
          stepType: StepType.GENERIC,
          vendorType: VendorType.PROCESS_RESOURCE,
          vendorId: result.process.id,
          vendorName: result.vendorName,
          startDate: stepStart,
          endDate: addWorkingDays(stepStart, result.days, workingDays, holidays, steps.length ? buffer : 0),
          days: result.days,
          cost: result.cost,
          confidencePct: result.confidencePct,
          parallelGroup: stageResults.length > 1 ? workflowStep.sortOrder : null,
          splits: result.splits,
          alternatives: result.alternatives,
          stageId: result.membership.stageId,
          stageName: result.membership.stage.name,
          isCritical: result.days === stepDays,
        } as BuiltStep & { stageId: string; stageName: string; isCritical: boolean });
      }
    }

    if (!steps.length) throw new Error('لا توجد مراحل مفعلة في سير العمل');
    const totalDays = countWorkingDaysBetween(start, cursor, workingDays, holidays);
    const slack = countWorkingDaysBetween(cursor, input.deadline, workingDays, holidays);
    const meetsDeadline = cursor <= input.deadline;
    const deadlineRiskPct = meetsDeadline ? Math.max(0, Math.min(35, 35 - slack * 3)) : Math.min(99, 55 + Math.abs(slack) * 5);

    return {
      type,
      totalDays,
      totalCost,
      certaintyPct: confidenceCount ? confidenceSum / confidenceCount : 0,
      p50Days,
      p90Days,
      meetsDeadline,
      splitCount,
      deadlineRiskPct,
      vendorSummary: steps
        .map((step) => {
          const stageName = (step as BuiltStep & { stageName?: string }).stageName;
          return `${stageName || step.stepType}: ${step.vendorName}`;
        })
        .join(' → '),
      steps,
    };
  });

  const constraintsPayload = {
    workflowId: input.workflowId,
    enabledStageIds: input.enabledStageIds,
    candidateProcessIdsByStage: input.candidateProcessIdsByStage,
    splitSharesByStage: input.splitSharesByStage,
    monteCarloTrials: input.monteCarloTrials,
    maxScenarios: input.maxScenarios,
    alternativesByScenario: Object.fromEntries(
      built.map((scenario) => [
        scenario.type,
        scenario.steps.map((step) =>
          step.alternatives.map(({ vendorId, vendorName, days, cost }) => ({ vendorId, vendorName, days, cost }))
        ),
      ])
    ),
  };

  return prisma.$transaction(async (tx) => {
    const run = await tx.planningRun.create({
      data: {
        orderId: input.orderId,
        runById: input.runById,
        workflowId: input.workflowId,
        deadline: input.deadline,
        quantity: input.quantity,
        customWeights: input.customWeights ? JSON.stringify(input.customWeights) : null,
        constraintsJson: JSON.stringify(constraintsPayload),
        monteCarloTrials: input.monteCarloTrials || 1000,
        maxScenarios: input.maxScenarios || built.length,
      },
    });

    const scenarios = [];
    for (const [index, scenario] of built.entries()) {
      const created = await tx.scenario.create({
        data: {
          planningRunId: run.id,
          type: scenario.type,
          totalDays: scenario.totalDays,
          totalCost: scenario.totalCost,
          certaintyPct: scenario.certaintyPct,
          p5Days: Math.max(1, Math.round(scenario.p50Days * 0.8)),
          p50Days: scenario.p50Days,
          p90Days: scenario.p90Days,
          p95Days: Math.max(scenario.p90Days, Math.round(scenario.p90Days * 1.08)),
          onTimePct: Math.max(0, Math.min(100, 100 - scenario.deadlineRiskPct)),
          isRecommended: scenario.type === ScenarioType.BALANCED || index === 0,
          rankLabel: SCENARIO_LABELS[scenario.type],
          meetsDeadline: scenario.meetsDeadline,
          splitCount: scenario.splitCount,
          deadlineRiskPct: scenario.deadlineRiskPct,
          vendorSummary: scenario.vendorSummary,
          steps: {
            create: scenario.steps.map((step) => ({
              stepOrder: step.stepOrder,
              stepType: step.stepType,
              vendorType: step.vendorType,
              vendorId: step.vendorId,
              vendorName: step.vendorName,
              stageId: (step as BuiltStep & { stageId?: string }).stageId,
              stageName: (step as BuiltStep & { stageName?: string }).stageName,
              startDate: step.startDate,
              endDate: step.endDate,
              p95EndDate: addWorkingDays(step.endDate, Math.max(1, Math.ceil(step.days * 0.08)), workingDays, holidays),
              days: step.days,
              cost: step.cost,
              confidencePct: step.confidencePct,
              parallelGroup: step.parallelGroup,
              isCritical: Boolean((step as BuiltStep & { isCritical?: boolean }).isCritical),
              splits: step.splits.length ? { create: step.splits.map((sp) => ({ ...sp, splitPct: sp.splitPct })) } : undefined,
            })),
          },
        },
        include: { steps: { include: { splits: true }, orderBy: { stepOrder: 'asc' } } },
      });
      scenarios.push({ ...created, label: SCENARIO_LABELS[scenario.type] });
    }

    await tx.order.update({ where: { id: input.orderId }, data: { deadline: input.deadline, status: 'PLANNED' } });
    return { run, scenarios };
  });
}

export async function runPlanning(input: PlanningInput) {
  if (input.workflowId) return runWorkflowPlanning(input);

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

  return prisma.$transaction(async (tx) => {
    const run = await tx.planningRun.create({
      data: {
        orderId: input.orderId,
        runById: input.runById,
        workflowId: input.workflowId || null,
        deadline: input.deadline,
        quantity: input.quantity,
        customWeights: input.customWeights ? JSON.stringify(input.customWeights) : null,
        constraintsJson: JSON.stringify(constraintsPayload),
        monteCarloTrials: input.monteCarloTrials || 1000,
        maxScenarios: input.maxScenarios || built.length,
      },
    });

    const scenarios = [];
    for (const [index, s] of built.entries()) {
      const scenario = await tx.scenario.create({
        data: {
          planningRunId: run.id,
          type: s.type,
          totalDays: s.totalDays,
          totalCost: s.totalCost,
          certaintyPct: s.certaintyPct,
          p5Days: Math.max(1, Math.round(s.p50Days * 0.8)),
          p50Days: s.p50Days,
          p90Days: s.p90Days,
          p95Days: Math.max(s.p90Days, Math.round(s.p90Days * 1.08)),
          onTimePct: Math.max(0, Math.min(100, 100 - s.deadlineRiskPct)),
          isRecommended: s.type === ScenarioType.BALANCED || index === 0,
          rankLabel: SCENARIO_LABELS[s.type],
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
              stageName: step.stepType,
              startDate: step.startDate,
              endDate: step.endDate,
              p95EndDate: addWorkingDays(step.endDate, Math.max(1, Math.ceil(step.days * 0.08)), parseWorkingDays(cfg), parseHolidays(cfg)),
              days: step.days,
              cost: step.cost,
              confidencePct: step.confidencePct,
              parallelGroup: step.parallelGroup,
              isCritical: step.days === Math.max(...s.steps.map((candidate) => candidate.days)),
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

    await tx.order.update({
      where: { id: input.orderId },
      data: { deadline: input.deadline, status: 'PLANNED' },
    });

    return { run, scenarios };
  });
}

export function scenarioToGraph(scenario: {
  steps: Array<{
    id: string;
    stepOrder: number;
    stepType: StepType;
    stageName?: string | null;
    vendorName: string;
    days: number;
    cost: unknown;
    isCritical?: boolean;
    splits: Array<{ vendorName: string; splitPct: unknown }>;
  }>;
  type: ScenarioType;
  vendorSummary: string;
}) {
  const nodes: Array<{ id: string; label: string; type: string }> = [
    { id: 'start', label: 'بداية الطلب', type: 'start' },
  ];
  const edges: Array<{ id: string; source: string; target: string }> = [];

  const groups = [...new Map(
    scenario.steps.map((step) => [step.stepOrder, scenario.steps.filter((candidate) => candidate.stepOrder === step.stepOrder)])
  ).values()];

  groups.forEach((group, groupIndex) => {
    group.forEach((step) => {
      const nodeId = `step-${step.id}`;
      const label = step.splits?.length
        ? step.splits.map((s) => `${s.vendorName} (${Number(s.splitPct)}%)`).join('\n')
        : step.vendorName;
      const stageLabel = step.stageName || step.stepType;
      nodes.push({
        id: nodeId,
        label: `${stageLabel}: ${label}\n${step.days} يوم${step.isCritical ? '\nCritical' : ''}`,
        type: step.stepType === StepType.GENERIC ? 'process' : step.stepType.toLowerCase(),
      });

      const prevGroup = groups[groupIndex - 1];
      if (!prevGroup) {
        edges.push({ id: `e-start-${step.id}`, source: 'start', target: nodeId });
      } else {
        prevGroup.forEach((prev) => {
          edges.push({ id: `e-${prev.id}-${step.id}`, source: `step-${prev.id}`, target: nodeId });
        });
      }
    });
  });

  const lastGroup = groups[groups.length - 1];
  if (lastGroup?.length) {
    nodes.push({ id: 'end', label: 'اكتمال', type: 'end' });
    lastGroup.forEach((last) => edges.push({ id: `e-${last.id}-end`, source: `step-${last.id}`, target: 'end' }));
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
