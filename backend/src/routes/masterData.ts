import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest, requireWrite, requireView } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { toNumber } from '../lib/utils';
import { param } from '../lib/param';

function vendorBody(body: Record<string, unknown>) {
  return {
    name: String(body.name),
    processingDays: Number(body.processingDays) || 1,
    costPerUnit: Number(body.costPerUnit) || 0,
    fixedCost: Number(body.fixedCost) || 0,
    confidencePct: Number(body.confidencePct) ?? 80,
    isActive: body.isActive !== false,
    isSplittable: Boolean(body.isSplittable),
    minSplitPct: Number(body.minSplitPct) || 10,
    maxSplits: Number(body.maxSplits) || 2,
    notes: body.notes ? String(body.notes) : null,
  };
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

router.get('/factories', async (req, res) => {
  const search = String(req.query.search || '');
  const rows = await prisma.factory.findMany({
    where: search ? { name: { contains: search } } : undefined,
    orderBy: { name: 'asc' },
  });
  res.json(rows.map(serializeFactory));
});

router.post('/factories', requireWrite, async (req: AuthRequest, res) => {
  const data = { ...vendorBody(req.body), categories: req.body.categories || null, capacityPerDay: req.body.capacityPerDay || null };
  const row = await prisma.factory.create({ data });
  await logAudit(req.user!.userId, 'CREATE', 'Factory', row.id);
  res.status(201).json(serializeFactory(row));
});

router.post('/factories/:id/duplicate', requireWrite, async (req: AuthRequest, res) => {
  const src = await prisma.factory.findUnique({ where: { id: param(req.params.id) } });
  if (!src) return res.status(404).json({ error: 'غير موجود' });
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
  res.status(201).json(serializeFactory(row));
});

router.patch('/factories/:id', requireWrite, async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const row = await prisma.factory.update({
    where: { id },
    data: {
      ...vendorBody(req.body),
      ...(req.body.categories !== undefined ? { categories: req.body.categories || null } : {}),
      ...(req.body.capacityPerDay !== undefined ? { capacityPerDay: req.body.capacityPerDay || null } : {}),
    },
  });
  await logAudit(req.user!.userId, 'UPDATE', 'Factory', row.id);
  res.json(serializeFactory(row));
});

router.delete('/factories/:id', requireWrite, async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  await prisma.factory.delete({ where: { id } });
  await logAudit(req.user!.userId, 'DELETE', 'Factory', id);
  res.status(204).send();
});

router.get('/printing-places', async (req, res) => {
  const search = String(req.query.search || '');
  const rows = await prisma.printingPlace.findMany({
    where: search ? { name: { contains: search } } : undefined,
    orderBy: { name: 'asc' },
  });
  res.json(rows.map((r) => ({ ...r, processingDays: toNumber(r.processingDays), costPerUnit: toNumber(r.costPerUnit), fixedCost: toNumber(r.fixedCost), confidencePct: toNumber(r.confidencePct) })));
});

router.post('/printing-places', requireWrite, async (req: AuthRequest, res) => {
  const row = await prisma.printingPlace.create({ data: { ...vendorBody(req.body), printTypes: req.body.printTypes || null } });
  await logAudit(req.user!.userId, 'CREATE', 'PrintingPlace', row.id);
  res.status(201).json(row);
});

router.post('/printing-places/:id/duplicate', requireWrite, async (req: AuthRequest, res) => {
  const src = await prisma.printingPlace.findUnique({ where: { id: param(req.params.id) } });
  if (!src) return res.status(404).json({ error: 'غير موجود' });
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
});

router.patch('/printing-places/:id', requireWrite, async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const row = await prisma.printingPlace.update({
    where: { id },
    data: {
      ...vendorBody(req.body),
      ...(req.body.printTypes !== undefined ? { printTypes: req.body.printTypes || null } : {}),
    },
  });
  res.json(row);
});

router.delete('/printing-places/:id', requireWrite, async (req: AuthRequest, res) => {
  await prisma.printingPlace.delete({ where: { id: param(req.params.id) } });
  res.status(204).send();
});

router.get('/fabric-suppliers', async (req, res) => {
  const search = String(req.query.search || '');
  const rows = await prisma.fabricSupplier.findMany({
    where: search ? { name: { contains: search } } : undefined,
    orderBy: { name: 'asc' },
  });
  res.json(rows);
});

router.post('/fabric-suppliers', requireWrite, async (req: AuthRequest, res) => {
  const row = await prisma.fabricSupplier.create({ data: { ...vendorBody(req.body), moq: req.body.moq || null } });
  await logAudit(req.user!.userId, 'CREATE', 'FabricSupplier', row.id);
  res.status(201).json(row);
});

router.patch('/fabric-suppliers/:id', requireWrite, async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const row = await prisma.fabricSupplier.update({
    where: { id },
    data: {
      ...vendorBody(req.body),
      ...(req.body.moq !== undefined ? { moq: req.body.moq || null } : {}),
    },
  });
  res.json(row);
});

router.delete('/fabric-suppliers/:id', requireWrite, async (req: AuthRequest, res) => {
  await prisma.fabricSupplier.delete({ where: { id: param(req.params.id) } });
  res.status(204).send();
});

export default router;
