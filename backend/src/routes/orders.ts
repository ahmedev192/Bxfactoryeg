import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { Prisma, OrderStatus, FieldType } from '@prisma/client';
import { DEFAULT_ORDER_FIELDS } from '@production-ops/shared';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest, requireWrite, requireView, requirePdfExport } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { UPLOAD_DIR, parseJsonArray, toNumber } from '../lib/utils';
import { param } from '../lib/param';
import { isValidStatusTransition } from '../lib/orderStatus';
import { asyncHandler, ApiError, validateBody } from '../lib/http';
import { createOrderSchema, orderStatusSchema, patchOrderSchema, pdfExportSchema } from '../lib/schemas';

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'photos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'pdfs');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => cb(null, `${randomUUID()}.pdf`),
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

const pdfUpload = multer({
  storage: pdfStorage,
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

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

function deleteFileQuietly(filePath?: string | null) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* best-effort cleanup */
  }
}

function hasMagicBytes(filePath: string, type: 'image' | 'pdf') {
  const buffer = fs.readFileSync(filePath).subarray(0, 16);
  if (type === 'pdf') return buffer.subarray(0, 4).toString() === '%PDF';
  const hex = buffer.toString('hex');
  return (
    hex.startsWith('ffd8ff') ||
    hex.startsWith('89504e47') ||
    hex.startsWith('47494638') ||
    hex.startsWith('52494646')
  );
}

async function nextOrderNo(explicit?: string, attempt = 0) {
  if (explicit) return explicit;
  const count = await prisma.order.count();
  const suffix = count + 1 + attempt;
  return `PO-${String(suffix).padStart(5, '0')}`;
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

router.get('/', asyncHandler(async (req, res) => {
  const { search, status, from, to } = req.query;
  const take = Math.min(Number(req.query.take) || 100, 500);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
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
    take,
    skip,
  });
  res.json(orders);
}));

router.post('/', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const body = validateBody(createOrderSchema, req.body);
  let order: Awaited<ReturnType<typeof prisma.order.create>> | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const orderNo = await nextOrderNo(body.orderNo, attempt);
      order = await prisma.order.create({
        data: {
          orderNo,
          deadline: body.deadline ?? null,
          category: body.category || null,
          requiredPrintType: body.requiredPrintType || null,
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
      break;
    } catch (err) {
      if (body.orderNo || !(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    }
  }
  if (!order) throw new ApiError(409, 'تعذر إنشاء رقم أمر إنتاج فريد');
  await logAudit(req.user!.userId, 'CREATE', 'Order', order.id);
  res.status(201).json(order);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const order = await loadOrder(param(req.params.id));
  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  res.json(serializeOrder(order));
}));

router.patch('/:id', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const body = validateBody(patchOrderSchema, req.body);
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.deadline !== undefined ? { deadline: body.deadline } : {}),
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
        ...(body.colors !== undefined ? { colors: JSON.stringify(body.colors) } : {}),
        ...(body.sizes !== undefined ? { sizes: JSON.stringify(body.sizes) } : {}),
        ...(body.totalQty !== undefined ? { totalQty: body.totalQty } : {}),
        ...(body.category !== undefined ? { category: body.category || null } : {}),
        ...(body.requiredPrintType !== undefined ? { requiredPrintType: body.requiredPrintType || null } : {}),
      },
    });

    if (body.fields) {
      await tx.orderField.deleteMany({ where: { orderId: id } });
      await tx.orderField.createMany({
        data: body.fields.map((f, i) => ({
          orderId: id,
          label: f.label,
          value: f.value || '',
          fieldType: f.fieldType || FieldType.TEXT,
          sortOrder: f.sortOrder ?? i,
          isRequired: Boolean(f.isRequired),
          options: f.options || null,
        })),
      });
    }

    if (body.matrixCells) {
      await tx.orderMatrixCell.deleteMany({ where: { orderId: id } });
      await tx.orderMatrixCell.createMany({
        data: body.matrixCells.map((c) => ({
          orderId: id,
          color: c.color,
          size: c.size,
          quantity: c.quantity,
        })),
      });
      const total = body.matrixCells.reduce((s, c) => s + c.quantity, 0);
      await tx.order.update({ where: { id }, data: { totalQty: total } });
    }
  });
  await logAudit(req.user!.userId, 'UPDATE', 'Order', id);
  const order = await loadOrder(id);
  res.json(serializeOrder(order!));
}));

router.patch('/:id/status', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'الطلب غير موجود');
  const { status: next } = validateBody(orderStatusSchema, req.body);
  if (!isValidStatusTransition(existing.status, next)) {
    throw new ApiError(400, `انتقال غير مسموح: ${existing.status} → ${next}`);
  }
  const order = await prisma.order.update({ where: { id }, data: { status: next } });
  await logAudit(req.user!.userId, 'STATUS', 'Order', order.id, next);
  res.json(order);
}));

router.post('/:id/photos', requireWrite, photoUpload.array('photos', 20), asyncHandler(async (req: AuthRequest, res) => {
  const orderId = param(req.params.id);
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  const files = req.files as Express.Multer.File[];
  for (const file of files) {
    if (!hasMagicBytes(file.path, 'image')) {
      files.forEach((f) => deleteFileQuietly(f.path));
      throw new ApiError(400, 'نوع صورة غير مدعوم');
    }
  }
  const existing = await prisma.orderPhoto.count({ where: { orderId } });
  let created;
  try {
    created = await prisma.$transaction(
      files.map((file, i) =>
        prisma.orderPhoto.create({
          data: {
            orderId,
            filename: file.originalname,
            path: file.path,
            sortOrder: existing + i,
          },
        })
      )
    );
  } catch (err) {
    files.forEach((file) => deleteFileQuietly(file.path));
    throw err;
  }
  await logAudit(req.user!.userId, 'UPLOAD_PHOTO', 'Order', orderId, String(created.length));
  res.status(201).json(created);
}));

router.delete('/:id/photos/:photoId', requireWrite, asyncHandler(async (req: AuthRequest, res) => {
  const orderId = param(req.params.id);
  const photoId = param(req.params.photoId);
  const photo = await prisma.orderPhoto.findFirst({ where: { id: photoId, orderId } });
  if (!photo) throw new ApiError(404, 'الصورة غير موجودة');
  deleteFileQuietly(photo.path);
  await prisma.orderPhoto.delete({ where: { id: photoId } });
  await logAudit(req.user!.userId, 'DELETE_PHOTO', 'Order', orderId, photoId);
  res.status(204).send();
}));

router.get('/:id/photos/:photoId/file', asyncHandler(async (req, res) => {
  const photo = await prisma.orderPhoto.findFirst({
    where: { id: param(req.params.photoId), orderId: param(req.params.id) },
  });
  if (!photo || !fs.existsSync(photo.path)) throw new ApiError(404, 'الصورة غير موجودة');
  res.sendFile(path.resolve(photo.path));
}));

router.post('/:id/pdf-exports', requirePdfExport, asyncHandler(async (req: AuthRequest, res) => {
  const orderId = param(req.params.id);
  const body = validateBody(pdfExportSchema, req.body);
  const filename = body.filename || 'production_order.pdf';
  const orient = body.orient || 'p';
  const record = await prisma.$transaction(async (tx) => {
    const count = await tx.pdfExport.count({ where: { orderId } });
    const created = await tx.pdfExport.create({
      data: {
        orderId,
        exportedBy: req.user!.userId,
        filename,
        orient,
        inclPhotos: body.inclPhotos,
        version: count + 1,
      },
    });
    await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.RELEASED } });
    return created;
  });
  await logAudit(req.user!.userId, 'PDF_EXPORT', 'Order', orderId, record.filename);
  res.status(201).json(record);
}));

router.post('/:id/pdf-exports/upload', requirePdfExport, pdfUpload.single('pdf'), asyncHandler(async (req: AuthRequest, res) => {
  const orderId = param(req.params.id);
  const file = req.file;
  if (!file) throw new ApiError(400, 'ملف PDF مطلوب');
  if (!hasMagicBytes(file.path, 'pdf')) {
    deleteFileQuietly(file.path);
    throw new ApiError(400, 'ملف PDF غير صالح');
  }
  const body = validateBody(pdfExportSchema, req.body);
  const filename = body.filename || 'production_order.pdf';
  const orient = body.orient || 'p';
  let record;
  try {
    record = await prisma.$transaction(async (tx) => {
      const count = await tx.pdfExport.count({ where: { orderId } });
      const created = await tx.pdfExport.create({
        data: {
          orderId,
          exportedBy: req.user!.userId,
          filename,
          orient,
          inclPhotos: body.inclPhotos,
          filePath: file.path,
          version: count + 1,
        },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.RELEASED } });
      return created;
    });
  } catch (err) {
    deleteFileQuietly(file.path);
    throw err;
  }
  await logAudit(req.user!.userId, 'PDF_EXPORT', 'Order', orderId, record.filename);
  res.status(201).json(record);
}));

router.get('/:id/pdf-exports/:exportId/download', asyncHandler(async (req, res) => {
  const record = await prisma.pdfExport.findFirst({
    where: { id: param(req.params.exportId), orderId: param(req.params.id) },
  });
  if (!record?.filePath || !fs.existsSync(record.filePath)) {
    throw new ApiError(404, 'ملف PDF غير موجود على الخادم');
  }
  res.download(record.filePath, record.filename);
}));

export default router;
