import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest, requireWrite, requireView } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { toNumber } from '../lib/utils';
import { param } from '../lib/param';
import { asyncHandler, ApiError, validateBody } from '../lib/http';
import { vendorCreateSchema, vendorPatchSchema } from '../lib/schemas';

function vendorBody(body: Record<string, unknown>) {
  const allowed = [
    'name',
    'processingDays',
    'costPerUnit',
    'fixedCost',
    'confidencePct',
    'isActive',
    'isSplittable',
    'minSplitPct',
    'maxSplits',
    'notes',
  ] as const;
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) data[key] = key === 'notes' ? body[key] || null : body[key];
  }
  return data;
}

function serializeFactory(f: Awaited<ReturnType<typeof prisma.factory.findFirst>>) {
  if (!f) return f;
  return {
    ...f,
    processingDays: toNumber(f.processingDays),
    costPerUnit: toNumber(f.costPerUnit),
    fixedCost: toNumber(f.fixedCost),
    confidencePct: toNumber(f.confidencePct),
    minSplitPct: toNumber(f.minSplitPct),
  };
}

const router = Router();
router.use(authMiddleware, requireView);

router.get('/factories', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '');
  const take = Math.min(Number(req.query.take) || 100, 500);
  const rows = await prisma.factory.findMany({
    where: search ? { name: { contains: search } } : undefined,
    orderBy: { name: 'asc' },
    take,
  });
  res.json(rows.map(serializeFactory));
}));

router.post('/factories', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const body = validateBody(vendorCreateSchema, req.body);
  const data = { ...vendorBody(body), categories: body.categories || null, capacityPerDay: body.capacityPerDay || null };
  const row = await prisma.factory.create({ data: data as Parameters<typeof prisma.factory.create>[0]['data'] });
  await logAudit(req.user!.userId, 'CREATE', 'Factory', row.id);
  res.status(201).json(serializeFactory(row));
}));

router.post('/factories/:id/duplicate', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const src = await prisma.factory.findUnique({ where: { id: param(req.params.id) } });
  if (!src) throw new ApiError(404, 'غير موجود');
  const row = await prisma.factory.create({
    data: {
      name: `${src.name} (نسخة)`,
      processingDays: src.processingDays,
      costPerUnit: src.costPerUnit,
      fixedCost: src.fixedCost,
      confidencePct: src.confidencePct,
      isActive: src.isActive,
      isSplittable: src.isSplittable,
      minSplitPct: src.minSplitPct,
      maxSplits: src.maxSplits,
      capacityPerDay: src.capacityPerDay,
      categories: src.categories,
      notes: src.notes,
    },
  });
  await logAudit(req.user!.userId, 'CREATE', 'Factory', row.id);
  res.status(201).json(serializeFactory(row));
}));

router.patch('/factories/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const body = validateBody(vendorPatchSchema, req.body);
  const row = await prisma.factory.update({
    where: { id },
    data: {
      ...vendorBody(body),
      ...(body.categories !== undefined ? { categories: body.categories || null } : {}),
      ...(body.capacityPerDay !== undefined ? { capacityPerDay: body.capacityPerDay || null } : {}),
    } as Parameters<typeof prisma.factory.update>[0]['data'],
  });
  await logAudit(req.user!.userId, 'UPDATE', 'Factory', row.id);
  res.json(serializeFactory(row));
}));

router.delete('/factories/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  await prisma.factory.delete({ where: { id } });
  await logAudit(req.user!.userId, 'DELETE', 'Factory', id);
  res.status(204).send();
}));

router.get('/printing-places', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '');
  const take = Math.min(Number(req.query.take) || 100, 500);
  const rows = await prisma.printingPlace.findMany({
    where: search ? { name: { contains: search } } : undefined,
    orderBy: { name: 'asc' },
    take,
  });
  res.json(rows.map((r) => ({ ...r, processingDays: toNumber(r.processingDays), costPerUnit: toNumber(r.costPerUnit), fixedCost: toNumber(r.fixedCost), confidencePct: toNumber(r.confidencePct) })));
}));

router.post('/printing-places', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const body = validateBody(vendorCreateSchema, req.body);
  const row = await prisma.printingPlace.create({ data: { ...vendorBody(body), printTypes: body.printTypes || null } as Parameters<typeof prisma.printingPlace.create>[0]['data'] });
  await logAudit(req.user!.userId, 'CREATE', 'PrintingPlace', row.id);
  res.status(201).json(row);
}));

router.post('/printing-places/:id/duplicate', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const src = await prisma.printingPlace.findUnique({ where: { id: param(req.params.id) } });
  if (!src) throw new ApiError(404, 'غير موجود');
  const row = await prisma.printingPlace.create({
    data: {
      name: `${src.name} (نسخة)`,
      processingDays: src.processingDays,
      costPerUnit: src.costPerUnit,
      fixedCost: src.fixedCost,
      confidencePct: src.confidencePct,
      isActive: src.isActive,
      isSplittable: src.isSplittable,
      minSplitPct: src.minSplitPct,
      maxSplits: src.maxSplits,
      printTypes: src.printTypes,
      notes: src.notes,
    },
  });
  await logAudit(req.user!.userId, 'CREATE', 'PrintingPlace', row.id);
  res.status(201).json(row);
}));

router.patch('/printing-places/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const body = validateBody(vendorPatchSchema, req.body);
  const row = await prisma.printingPlace.update({
    where: { id },
    data: {
      ...vendorBody(body),
      ...(body.printTypes !== undefined ? { printTypes: body.printTypes || null } : {}),
    } as Parameters<typeof prisma.printingPlace.update>[0]['data'],
  });
  await logAudit(req.user!.userId, 'UPDATE', 'PrintingPlace', row.id);
  res.json(row);
}));

router.delete('/printing-places/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  await prisma.printingPlace.delete({ where: { id } });
  await logAudit(req.user!.userId, 'DELETE', 'PrintingPlace', id);
  res.status(204).send();
}));

router.get('/fabric-suppliers', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '');
  const take = Math.min(Number(req.query.take) || 100, 500);
  const rows = await prisma.fabricSupplier.findMany({
    where: search ? { name: { contains: search } } : undefined,
    orderBy: { name: 'asc' },
    take,
  });
  res.json(rows);
}));

router.post('/fabric-suppliers', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const body = validateBody(vendorCreateSchema, req.body);
  const row = await prisma.fabricSupplier.create({ data: { ...vendorBody(body), moq: body.moq || null } as Parameters<typeof prisma.fabricSupplier.create>[0]['data'] });
  await logAudit(req.user!.userId, 'CREATE', 'FabricSupplier', row.id);
  res.status(201).json(row);
}));

router.patch('/fabric-suppliers/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const body = validateBody(vendorPatchSchema, req.body);
  const row = await prisma.fabricSupplier.update({
    where: { id },
    data: {
      ...vendorBody(body),
      ...(body.moq !== undefined ? { moq: body.moq || null } : {}),
    } as Parameters<typeof prisma.fabricSupplier.update>[0]['data'],
  });
  await logAudit(req.user!.userId, 'UPDATE', 'FabricSupplier', row.id);
  res.json(row);
}));

router.delete('/fabric-suppliers/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  await prisma.fabricSupplier.delete({ where: { id } });
  await logAudit(req.user!.userId, 'DELETE', 'FabricSupplier', id);
  res.status(204).send();
}));

export default router;
