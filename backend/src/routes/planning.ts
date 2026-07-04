import { Router } from 'express';
import { StepType, VendorType } from '@prisma/client';
import { SCENARIO_LABELS } from '@production-ops/shared';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest, requireWrite, requireView, requirePlan } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { runPlanning, scenarioToGraph, monteCarloDeadlineRisk, buildDecisionGraph, computeParetoFrontier } from '../services/optimization';
import { recalculateVendorStatistics } from '../services/statistics';
import { toNumber } from '../lib/utils';
import { param } from '../lib/param';
import { asyncHandler, ApiError, validateBody } from '../lib/http';
import { actualsSchema, planningRunSchema, selectScenarioSchema } from '../lib/schemas';

const router = Router();
router.use(authMiddleware, requireView);

router.post('/orders/:orderId/planning-runs', requirePlan, asyncHandler(async (req: AuthRequest, res) => {
  const body = validateBody(planningRunSchema, req.body);
  const orderId = param(req.params.orderId);
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ApiError(404, 'الطلب غير موجود');

  const deadline = body.deadline || order.deadline || new Date();
  const quantity = body.quantity || order.totalQty || 1;

  const result = await runPlanning({
    orderId,
    runById: req.user!.userId,
    deadline,
    quantity,
    fabricIds: body.fabricIds,
    printIds: body.printIds,
    factoryIds: body.factoryIds,
    enableSplits: Boolean(body.enableSplits),
    customWeights: body.customWeights,
    orderCategory: body.orderCategory || order.category || undefined,
    requiredPrintType: body.requiredPrintType || order.requiredPrintType || undefined,
    workflowId: body.workflowId,
    enabledStageIds: body.enabledStageIds,
    candidateProcessIdsByStage: body.candidateProcessIdsByStage,
    splitSharesByStage: body.splitSharesByStage,
    monteCarloTrials: body.monteCarloTrials,
    maxScenarios: body.maxScenarios,
  });

  await logAudit(req.user!.userId, 'PLAN', 'Order', orderId);

  res.status(201).json({
    run: result.run,
    scenarios: result.scenarios.map((s) => ({
      ...s,
      label: SCENARIO_LABELS[s.type],
      totalCost: toNumber(s.totalCost),
      certaintyPct: toNumber(s.certaintyPct),
    })),
  });
}));

router.get('/orders/:orderId/planning-runs', asyncHandler(async (req, res) => {
  const runs = await prisma.planningRun.findMany({
    where: { orderId: param(req.params.orderId) },
    orderBy: { createdAt: 'desc' },
    include: {
      scenarios: {
        include: { steps: { include: { splits: true }, orderBy: { stepOrder: 'asc' } } },
      },
    },
  });
  res.json(runs);
}));

router.get('/planning-runs/:runId/scenarios', asyncHandler(async (req, res) => {
  const scenarios = await prisma.scenario.findMany({
    where: { planningRunId: param(req.params.runId) },
    include: { steps: { include: { splits: true }, orderBy: { stepOrder: 'asc' } } },
  });
  res.json(scenarios.map((s) => ({ ...s, label: SCENARIO_LABELS[s.type] })));
}));

router.get('/planning-runs/:runId/pareto', asyncHandler(async (req, res) => {
  const run = await prisma.planningRun.findUnique({
    where: { id: param(req.params.runId) },
    include: { scenarios: true },
  });
  if (!run) throw new ApiError(404, 'تشغيل التخطيط غير موجود');

  const frontier = computeParetoFrontier(
    run.scenarios.map((s) => ({
      id: s.id,
      type: s.type,
      totalDays: s.totalDays,
      totalCost: s.totalCost,
      certaintyPct: s.certaintyPct,
      label: SCENARIO_LABELS[s.type],
    }))
  );

  res.json({
    runId: run.id,
    orderId: run.orderId,
    frontier,
    onFrontier: frontier.filter((p) => p.isOnFrontier),
  });
}));

router.get('/scenarios/:id/graph', asyncHandler(async (req, res) => {
  const scenario = await prisma.scenario.findUnique({
    where: { id: param(req.params.id) },
    include: {
      steps: { include: { splits: true }, orderBy: { stepOrder: 'asc' } },
      planningRun: true,
    },
  });
  if (!scenario) throw new ApiError(404, 'السيناريو غير موجود');

  let alternativesByStep: Record<number, Array<{ vendorId: string; vendorName: string; days: number; cost: number }>> = {};
  if (scenario.planningRun.constraintsJson) {
    try {
      const parsed = JSON.parse(scenario.planningRun.constraintsJson) as {
        alternativesByScenario?: Record<string, Array<Array<{ vendorId: string; vendorName: string; days: number; cost: number }>>>;
      };
      const alts = parsed.alternativesByScenario?.[scenario.type];
      if (alts) {
        alts.forEach((stepAlts, idx) => {
          alternativesByStep[idx + 1] = stepAlts;
        });
      }
    } catch {
      /* ignore parse errors */
    }
  }

  const linearGraph = scenarioToGraph(scenario);
  const decisionGraph = buildDecisionGraph(scenario, alternativesByStep);

  res.json({
    ...linearGraph,
    decisionGraph,
  });
}));

router.post('/orders/:orderId/select-scenario', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const { scenarioId } = validateBody(selectScenarioSchema, req.body);
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: {
      steps: { orderBy: { stepOrder: 'asc' } },
      planningRun: true,
    },
  });
  if (!scenario) throw new ApiError(404, 'السيناريو غير موجود');

  if (scenario.planningRun.orderId !== param(req.params.orderId)) {
    throw new ApiError(400, 'السيناريو لا ينتمي لهذا الطلب');
  }

  const factoryStep = scenario.steps.find((s) => s.stepType === StepType.FACTORY);
  const summary = scenario.steps
    .map((s) => `${s.stepType}: ${s.vendorName} (${s.startDate.toISOString().split('T')[0]} → ${s.endDate.toISOString().split('T')[0]})`)
    .join('\n');

  const updates: Array<{ label: string; value: string }> = [];
  if (factoryStep) updates.push({ label: 'اسم المصنع', value: factoryStep.vendorName });
  updates.push({
    label: 'تعليمات',
    value: `مسار مختار: ${SCENARIO_LABELS[scenario.type]}\n${summary}\nإجمالي: ${scenario.totalDays} يوم | ${toNumber(scenario.totalCost)}`,
  });

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: param(req.params.orderId) },
      data: { selectedScenarioId: scenario.id, status: 'PLANNED' },
    });
    const order = await tx.order.findUnique({
      where: { id: param(req.params.orderId) },
      include: { fields: true },
    });
    for (const u of updates) {
      const field = order?.fields.find((f) => f.label === u.label);
      if (field) {
        await tx.orderField.update({ where: { id: field.id }, data: { value: u.value } });
      }
    }
  });

  await logAudit(req.user!.userId, 'SELECT_SCENARIO', 'Order', param(req.params.orderId), scenario.id);

  const refreshed = await prisma.order.findUnique({
    where: { id: param(req.params.orderId) },
    include: { fields: { orderBy: { sortOrder: 'asc' } }, selectedScenario: { include: { steps: true } } },
  });

  res.json({
    order: refreshed,
    prefill: { factoryName: factoryStep?.vendorName, instructions: updates.find((u) => u.label === 'تعليمات')?.value },
  });
}));

router.post('/orders/:orderId/actuals', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const parsed = validateBody(actualsSchema, req.body);
  const items = 'items' in parsed ? parsed.items : [parsed];
  const orderId = param(req.params.orderId);
  const saved = await prisma.$transaction(async (tx) => {
    const records = [];
    for (const item of items) {
      if (item.routeStepId) {
        const step = await tx.routeStep.findFirst({
          where: { id: item.routeStepId, scenario: { planningRun: { orderId } } },
          select: { id: true },
        });
        if (!step) throw new ApiError(400, 'خطوة التخطيط لا تنتمي لهذا الطلب');
        records.push(
          await tx.actualPerformance.upsert({
            where: { orderId_routeStepId: { orderId, routeStepId: item.routeStepId } },
            create: { orderId, ...item, routeStepId: item.routeStepId, notes: item.notes || null },
            update: { ...item, routeStepId: item.routeStepId, notes: item.notes || null },
          })
        );
      } else {
        records.push(
          await tx.actualPerformance.create({
            data: { orderId, ...item, routeStepId: null, notes: item.notes || null },
          })
        );
      }
    }
    await tx.order.update({ where: { id: orderId }, data: { status: 'COMPLETED' } });
    return records;
  });

  for (const item of items) {
    await recalculateVendorStatistics(item.vendorType as VendorType, item.vendorId);
  }

  await logAudit(req.user!.userId, 'ACTUALS', 'Order', orderId);
  res.status(201).json(saved);
}));

router.get('/orders/:orderId/actuals', asyncHandler(async (req, res) => {
  const actuals = await prisma.actualPerformance.findMany({
    where: { orderId: param(req.params.orderId) },
    orderBy: { recordedAt: 'desc' },
  });
  res.json(actuals);
}));

router.get('/orders/:orderId/deadline-risk', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: param(req.params.orderId) } });
  if (!order?.deadline) return res.json({ riskPct: 0 });
  const riskPct = await monteCarloDeadlineRisk(param(req.params.orderId), order.deadline);
  res.json({ riskPct });
}));

export default router;
