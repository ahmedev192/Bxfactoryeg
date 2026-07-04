import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { OrderStatus, FieldType } from '@prisma/client';
import { DEFAULT_ORDER_FIELDS } from '@production-ops/shared';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest, requireWrite, requireView, requirePdfExport } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { UPLOAD_DIR, parseJsonArray, toNumber } from '../lib/utils';
import { param } from '../lib/param';
import { isValidStatusTransition } from '../lib/orderStatus';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'photos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
router.use(authMiddleware, requireView);

async function loadOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      fields: { orderBy: { sortOrder: 'asc' } },
      matrixCells: true,
      photos: { orderBy: { sortOrder: 'asc' } },
      pdfExports: { orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } } } },
      planningRuns: {
        orderBy: { createdAt: 'desc' },
        include: {
          scenarios: {
            include: { steps: { include: { splits: true }, orderBy: { stepOrder: 'asc' } } },
          },
        },
      },
      selectedScenario: {
        include: { steps: { include: { splits: true }, orderBy: { stepOrder: 'asc' } } },
      },
      actualPerformances: { orderBy: { recordedAt: 'desc' } },
    },
  });
}

function serializeOrder(order: NonNullable<Awaited<ReturnType<typeof loadOrder>>>) {
  return {
    ...order,
    colors: parseJsonArray<string>(order.colors),
    sizes: parseJsonArray<string>(order.sizes),
    planningRuns: order.planningRuns.map((run) => ({
      ...run,
      scenarios: run.scenarios.map((s) => ({
        ...s,
        totalCost: toNumber(s.totalCost),
        certaintyPct: toNumber(s.certaintyPct),
        deadlineRiskPct: s.deadlineRiskPct ? toNumber(s.deadlineRiskPct) : null,
      })),
    })),
  };
}

router.get('/', async (req, res) => {
  const { search, status, from, to } = req.query;
  const orders = await prisma.order.findMany({
    where: {
      ...(search ? { orderNo: { contains: String(search) } } : {}),
      ...(status ? { status: status as OrderStatus } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(String(from)) } : {}),
              ...(to ? { lte: new Date(String(to)) } : {}),
            },
          }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: { createdBy: { select: { name: true } } },
  });
  res.json(orders);
});

router.post('/', requireWrite, async (req: AuthRequest, res) => {
  const count = await prisma.order.count();
  const orderNo = req.body.orderNo || `PO-${String(count + 1).padStart(5, '0')}`;
  const order = await prisma.order.create({
    data: {
      orderNo,
      deadline: req.body.deadline ? new Date(req.body.deadline) : null,
      createdById: req.user!.userId,
      fields: {
        create: DEFAULT_ORDER_FIELDS.map((f, i) => ({
          label: f.label,
          value: f.value,
          fieldType: f.fieldType as FieldType,
          sortOrder: i,
        })),
      },
    },
    include: { fields: true },
  });
  await logAudit(req.user!.userId, 'CREATE', 'Order', order.id);
  res.status(201).json(order);
});

router.get('/:id', async (req, res) => {
  const order = await loadOrder(param(req.params.id));
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
  res.json(serializeOrder(order));
});

router.patch('/:id', requireWrite, async (req: AuthRequest, res) => {
  const { status, deadline, notes, colors, sizes, fields, matrixCells, totalQty, category, requiredPrintType } = req.body;
  await prisma.order.update({
    where: { id: param(req.params.id) },
    data: {
      ...(status ? { status } : {}),
      ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(colors ? { colors: JSON.stringify(colors) } : {}),
      ...(sizes ? { sizes: JSON.stringify(sizes) } : {}),
      ...(totalQty !== undefined ? { totalQty: Number(totalQty) } : {}),
      ...(category !== undefined ? { category: category || null } : {}),
      ...(requiredPrintType !== undefined ? { requiredPrintType: requiredPrintType || null } : {}),
    },
  });

  if (fields) {
    await prisma.orderField.deleteMany({ where: { orderId: param(req.params.id) } });
    await prisma.orderField.createMany({
      data: fields.map((f: { label: string; value: string; fieldType: FieldType; sortOrder: number; isRequired?: boolean; options?: string }, i: number) => ({
        orderId: param(req.params.id),
        label: f.label,
        value: f.value || '',
        fieldType: f.fieldType || FieldType.TEXT,
        sortOrder: f.sortOrder ?? i,
        isRequired: Boolean(f.isRequired),
        options: f.options || null,
      })),
    });
  }

  if (matrixCells) {
    await prisma.orderMatrixCell.deleteMany({ where: { orderId: param(req.params.id) } });
    await prisma.orderMatrixCell.createMany({
      data: matrixCells.map((c: { color: string; size: string; quantity: number }) => ({
        orderId: param(req.params.id),
        color: c.color,
        size: c.size,
        quantity: Number(c.quantity) || 0,
      })),
    });
    const total = matrixCells.reduce((s: number, c: { quantity: number }) => s + (Number(c.quantity) || 0), 0);
    await prisma.order.update({ where: { id: param(req.params.id) }, data: { totalQty: total } });
  }

  const order = await loadOrder(param(req.params.id));
  res.json(serializeOrder(order!));
});

router.patch('/:id/status', requireWrite, async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'الطلب غير موجود' });
  const next = req.body.status as OrderStatus;
  if (!isValidStatusTransition(existing.status, next)) {
    return res.status(400).json({ error: `انتقال غير مسموح: ${existing.status} → ${next}` });
  }
  const order = await prisma.order.update({ where: { id }, data: { status: next } });
  await logAudit(req.user!.userId, 'STATUS', 'Order', order.id, next);
  res.json(order);
});

router.post('/:id/photos', requireWrite, upload.array('photos', 20), async (req: AuthRequest, res) => {
  const files = req.files as Express.Multer.File[];
  const existing = await prisma.orderPhoto.count({ where: { orderId: param(req.params.id) } });
  const created = await Promise.all(
    files.map((file, i) =>
      prisma.orderPhoto.create({
        data: {
          orderId: param(req.params.id),
          filename: file.originalname,
          path: file.path,
          sortOrder: existing + i,
        },
      })
    )
  );
  res.status(201).json(created);
});

router.delete('/:id/photos/:photoId', requireWrite, async (req, res) => {
  const photo = await prisma.orderPhoto.findUnique({ where: { id: param(req.params.photoId) } });
  if (photo?.path && fs.existsSync(photo.path)) fs.unlinkSync(photo.path);
  await prisma.orderPhoto.delete({ where: { id: param(req.params.photoId) } });
  res.status(204).send();
});

router.get('/:id/photos/:photoId/file', async (req, res) => {
  const photo = await prisma.orderPhoto.findUnique({ where: { id: param(req.params.photoId) } });
  if (!photo || !fs.existsSync(photo.path)) return res.status(404).json({ error: 'الصورة غير موجودة' });
  res.sendFile(path.resolve(photo.path));
});

router.post('/:id/pdf-exports', requirePdfExport, async (req: AuthRequest, res) => {
  const count = await prisma.pdfExport.count({ where: { orderId: param(req.params.id) } });
  const record = await prisma.pdfExport.create({
    data: {
      orderId: param(req.params.id),
      exportedBy: req.user!.userId,
      filename: req.body.filename || 'production_order.pdf',
      orient: req.body.orient || 'p',
      inclPhotos: req.body.inclPhotos !== false,
      filePath: req.body.filePath || null,
      version: count + 1,
    },
  });
  await prisma.order.update({ where: { id: param(req.params.id) }, data: { status: OrderStatus.RELEASED } });
  await logAudit(req.user!.userId, 'PDF_EXPORT', 'Order', param(req.params.id), record.filename);
  res.status(201).json(record);
});

router.post('/:id/pdf-exports/upload', requirePdfExport, upload.single('pdf'), async (req: AuthRequest, res) => {
  const file = req.file;
  const count = await prisma.pdfExport.count({ where: { orderId: param(req.params.id) } });
  const dest = file
    ? path.join(UPLOAD_DIR, 'pdfs', `${param(req.params.id)}-v${count + 1}.pdf`)
    : null;
  if (file && dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(file.path, dest);
  }
  const record = await prisma.pdfExport.create({
    data: {
      orderId: param(req.params.id),
      exportedBy: req.user!.userId,
      filename: req.body.filename || 'production_order.pdf',
      orient: req.body.orient || 'p',
      inclPhotos: req.body.inclPhotos !== false,
      filePath: dest,
      version: count + 1,
    },
  });
  await prisma.order.update({ where: { id: param(req.params.id) }, data: { status: OrderStatus.RELEASED } });
  await logAudit(req.user!.userId, 'PDF_EXPORT', 'Order', param(req.params.id), record.filename);
  res.status(201).json(record);
});

router.get('/:id/pdf-exports/:exportId/download', async (req, res) => {
  const record = await prisma.pdfExport.findUnique({ where: { id: param(req.params.exportId) } });
  if (!record?.filePath || !fs.existsSync(record.filePath)) {
    return res.status(404).json({ error: 'ملف PDF غير موجود على الخادم' });
  }
  res.download(record.filePath, record.filename);
});

export default router;
