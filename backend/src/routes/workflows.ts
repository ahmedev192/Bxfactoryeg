import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest, requireView, requireWrite } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { asyncHandler, ApiError, validateBody } from '../lib/http';
import {
  processResourcePatchSchema,
  processResourceSchema,
  stagePatchSchema,
  stageSchema,
  workflowPatchSchema,
  workflowSchema,
} from '../lib/schemas';
import { param } from '../lib/param';
import { toNumber } from '../lib/utils';

const router = Router();
router.use(authMiddleware, requireView);

function serializeProcess(p: (Awaited<ReturnType<typeof prisma.processResource.findMany>>[number] & { thresholds?: Array<{ addDays: unknown }> }) | null) {
  if (!p) return p;
  return {
    ...p,
    timeOptimistic: toNumber(p.timeOptimistic),
    timeMostLikely: toNumber(p.timeMostLikely),
    timePessimistic: toNumber(p.timePessimistic),
    cost: toNumber(p.cost),
    confidencePct: toNumber(p.confidencePct),
    minSplitPct: toNumber(p.minSplitPct),
    thresholds: p.thresholds?.map((t: { addDays: unknown }) => ({ ...t, addDays: toNumber(t.addDays) })) || [],
  };
}

router.get('/stages', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '');
  const rows = await prisma.stage.findMany({
    where: search ? { name: { contains: search } } : undefined,
    orderBy: { name: 'asc' },
  });
  res.json(rows);
}));

router.post('/stages', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const body = validateBody(stageSchema, req.body);
  const row = await prisma.stage.create({ data: { ...body, description: body.description || null } });
  await logAudit(req.user!.userId, 'CREATE', 'Stage', row.id);
  res.status(201).json(row);
}));

router.patch('/stages/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const body = validateBody(stagePatchSchema, req.body);
  const row = await prisma.stage.update({
    where: { id: param(req.params.id) },
    data: { ...body, ...(body.description !== undefined ? { description: body.description || null } : {}) },
  });
  await logAudit(req.user!.userId, 'UPDATE', 'Stage', row.id);
  res.json(row);
}));

router.delete('/stages/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  await prisma.stage.update({ where: { id }, data: { isActive: false } });
  await logAudit(req.user!.userId, 'ARCHIVE', 'Stage', id);
  res.status(204).send();
}));

router.get('/workflows', asyncHandler(async (_req, res) => {
  const rows = await prisma.workflowTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      steps: {
        orderBy: { sortOrder: 'asc' },
        include: { stages: { orderBy: { sortOrder: 'asc' }, include: { stage: true } } },
      },
    },
  });
  res.json(rows);
}));

router.post('/workflows', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const body = validateBody(workflowSchema, req.body);
  const workflow = await prisma.$transaction(async (tx) =>
    tx.workflowTemplate.create({
      data: {
        name: body.name,
        description: body.description || null,
        isActive: body.isActive,
        steps: {
          create: body.steps.map((step) => ({
            sortOrder: step.sortOrder,
            stages: {
              create: step.stageIds.map((stageId, sortOrder) => ({ stageId, sortOrder })),
            },
          })),
        },
      },
      include: { steps: { include: { stages: { include: { stage: true } } }, orderBy: { sortOrder: 'asc' } } },
    })
  );
  await logAudit(req.user!.userId, 'CREATE', 'WorkflowTemplate', workflow.id);
  res.status(201).json(workflow);
}));

router.patch('/workflows/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const body = validateBody(workflowPatchSchema, req.body);
  const existing = await prisma.workflowTemplate.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'قالب سير العمل غير موجود');

  const workflow = await prisma.$transaction(async (tx) => {
    if (body.steps) {
      await tx.workflowStep.deleteMany({ where: { workflowId: id } });
    }
    return tx.workflowTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.steps
          ? {
              steps: {
                create: body.steps.map((step) => ({
                  sortOrder: step.sortOrder,
                  stages: { create: step.stageIds.map((stageId, sortOrder) => ({ stageId, sortOrder })) },
                })),
              },
            }
          : {}),
      },
      include: { steps: { include: { stages: { include: { stage: true } } }, orderBy: { sortOrder: 'asc' } } },
    });
  });
  await logAudit(req.user!.userId, 'UPDATE', 'WorkflowTemplate', id);
  res.json(workflow);
}));

router.delete('/workflows/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  await prisma.workflowTemplate.update({ where: { id }, data: { isActive: false } });
  await logAudit(req.user!.userId, 'ARCHIVE', 'WorkflowTemplate', id);
  res.status(204).send();
}));

router.get('/process-resources', asyncHandler(async (req, res) => {
  const stageId = req.query.stageId ? String(req.query.stageId) : undefined;
  const rows = await prisma.processResource.findMany({
    where: stageId ? { stageId } : undefined,
    include: { stage: true, thresholds: { orderBy: { minQty: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(rows.map(serializeProcess));
}));

router.post('/process-resources', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const body = validateBody(processResourceSchema, req.body);
  const row = await prisma.processResource.create({
    data: {
      ...body,
      notes: body.notes || null,
      thresholds: { create: body.thresholds },
    },
    include: { stage: true, thresholds: { orderBy: { minQty: 'asc' } } },
  });
  await logAudit(req.user!.userId, 'CREATE', 'ProcessResource', row.id);
  res.status(201).json(serializeProcess(row));
}));

router.patch('/process-resources/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const body = validateBody(processResourcePatchSchema, req.body);
  const row = await prisma.$transaction(async (tx) => {
    if (body.thresholds) {
      await tx.processQuantityThreshold.deleteMany({ where: { processResourceId: id } });
    }
    return tx.processResource.update({
      where: { id },
      data: {
        ...body,
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
        ...(body.thresholds ? { thresholds: { create: body.thresholds } } : {}),
      } as Parameters<typeof tx.processResource.update>[0]['data'],
      include: { stage: true, thresholds: { orderBy: { minQty: 'asc' } } },
    });
  });
  await logAudit(req.user!.userId, 'UPDATE', 'ProcessResource', id);
  res.json(serializeProcess(row));
}));

router.delete('/process-resources/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  await prisma.processResource.update({ where: { id }, data: { isActive: false } });
  await logAudit(req.user!.userId, 'ARCHIVE', 'ProcessResource', id);
  res.status(204).send();
}));

export default router;
