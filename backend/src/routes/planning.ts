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

const router = Router();
router.use(authMiddleware, requireView);

router.post('/orders/:orderId/planning-runs', requirePlan, async (req: AuthRequest, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: param(req.params.orderId) } });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

    const deadline = new Date(req.body.deadline || order.deadline || Date.now());
    const quantity = Number(req.body.quantity) || order.totalQty || 1;

    const result = await runPlanning({
      orderId: param(req.params.orderId),
      runById: req.user!.userId,
      deadline,
      quantity,
      fabricIds: req.body.fabricIds,
      printIds: req.body.printIds,
      factoryIds: req.body.factoryIds,
      enableSplits: Boolean(req.body.enableSplits),
      customWeights: req.body.customWeights,
    });

    await logAudit(req.user!.userId, 'PLAN', 'Order', param(req.params.orderId));

    res.status(201).json({
      run: result.run,
      scenarios: result.scenarios.map((s) => ({
        ...s,
        label: SCENARIO_LABELS[s.type],
        totalCost: toNumber(s.totalCost),
        certaintyPct: toNumber(s.certaintyPct),
      })),
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'خطأ في التخطيط' });
  }
});

router.get('/orders/:orderId/planning-runs', async (req, res) => {
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
});

router.get('/planning-runs/:runId/scenarios', async (req, res) => {
  const scenarios = await prisma.scenario.findMany({
    where: { planningRunId: param(req.params.runId) },
    include: { steps: { include: { splits: true }, orderBy: { stepOrder: 'asc' } } },
  });
  res.json(scenarios.map((s) => ({ ...s, label: SCENARIO_LABELS[s.type] })));
});

router.get('/planning-runs/:runId/pareto', async (req, res) => {
  const run = await prisma.planningRun.findUnique({
    where: { id: param(req.params.runId) },
    include: { scenarios: true },
  });
  if (!run) return res.status(404).json({ error: 'تشغيل التخطيط غير موجود' });

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
});

router.get('/scenarios/:id/graph', async (req, res) => {
  const scenario = await prisma.scenario.findUnique({
    where: { id: param(req.params.id) },
    include: {
      steps: { include: { splits: true }, orderBy: { stepOrder: 'asc' } },
      planningRun: true,
    },
  });
  if (!scenario) return res.status(404).json({ error: 'السيناريو غير موجود' });

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
});

router.post('/orders/:orderId/select-scenario', requireWrite, async (req: AuthRequest, res) => {
  const scenario = await prisma.scenario.findUnique({
    where: { id: req.body.scenarioId },
    include: {
      steps: { orderBy: { stepOrder: 'asc' } },
      planningRun: true,
    },
  });
  if (!scenario) return res.status(404).json({ error: 'السيناريو غير موجود' });

  if (scenario.planningRun.orderId !== param(req.params.orderId)) {
    return res.status(400).json({ error: 'السيناريو لا ينتمي لهذا الطلب' });
  }

  const factoryStep = scenario.steps.find((s) => s.stepType === StepType.FACTORY);
  const summary = scenario.steps
    .map((s) => `${s.stepType}: ${s.vendorName} (${s.startDate.toISOString().split('T')[0]} → ${s.endDate.toISOString().split('T')[0]})`)
    .join('\n');

  await prisma.order.update({
    where: { id: param(req.params.orderId) },
    data: { selectedScenarioId: scenario.id, status: 'PLANNED' },
  });

  const order = await prisma.order.findUnique({
    where: { id: param(req.params.orderId) },
    include: { fields: true },
  });

  const updates: Array<{ label: string; value: string }> = [];
  if (factoryStep) updates.push({ label: 'اسم المصنع', value: factoryStep.vendorName });
  updates.push({
    label: 'تعليمات',
    value: `مسار مختار: ${SCENARIO_LABELS[scenario.type]}\n${summary}\nإجمالي: ${scenario.totalDays} يوم | ${toNumber(scenario.totalCost)}`,
  });

  for (const u of updates) {
    const field = order?.fields.find((f) => f.label === u.label);
    if (field) {
      await prisma.orderField.update({ where: { id: field.id }, data: { value: u.value } });
    }
  }

  await logAudit(req.user!.userId, 'SELECT_SCENARIO', 'Order', param(req.params.orderId), scenario.id);

  const refreshed = await prisma.order.findUnique({
    where: { id: param(req.params.orderId) },
    include: { fields: { orderBy: { sortOrder: 'asc' } }, selectedScenario: { include: { steps: true } } },
  });

  res.json({
    order: refreshed,
    prefill: { factoryName: factoryStep?.vendorName, instructions: updates.find((u) => u.label === 'تعليمات')?.value },
  });
});

router.post('/orders/:orderId/actuals', requireWrite, async (req: AuthRequest, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
  const created = [];

  for (const item of items) {
    const record = await prisma.actualPerformance.create({
      data: {
        orderId: param(req.params.orderId),
        routeStepId: item.routeStepId || null,
        stepType: item.stepType,
        vendorType: item.vendorType as VendorType,
        vendorId: item.vendorId,
        vendorName: item.vendorName,
        plannedDays: Number(item.plannedDays),
        actualDays: Number(item.actualDays),
        plannedCost: Number(item.plannedCost),
        actualCost: Number(item.actualCost),
      },
    });
    await recalculateVendorStatistics(item.vendorType, item.vendorId);
    created.push(record);
  }

  await prisma.order.update({ where: { id: param(req.params.orderId) }, data: { status: 'COMPLETED' } });
  await logAudit(req.user!.userId, 'ACTUALS', 'Order', param(req.params.orderId));
  res.status(201).json(created);
});

router.get('/orders/:orderId/actuals', async (req, res) => {
  const actuals = await prisma.actualPerformance.findMany({
    where: { orderId: param(req.params.orderId) },
    orderBy: { recordedAt: 'desc' },
  });
  res.json(actuals);
});

router.get('/orders/:orderId/deadline-risk', async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: param(req.params.orderId) } });
  if (!order?.deadline) return res.json({ riskPct: 0 });
  const riskPct = await monteCarloDeadlineRisk(param(req.params.orderId), order.deadline);
  res.json({ riskPct });
});

export default router;
