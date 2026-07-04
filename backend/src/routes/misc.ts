import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { authMiddleware, requireAdmin, requireView, requireWrite, AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import {
  exportMasterDataWorkbook,
  exportMasterDataTemplate,
  exportPlanningResults,
  importMasterDataFromBuffer,
} from '../services/excel';
import { getVendorScorecard } from '../services/statistics';
import { param } from '../lib/param';
import { parseJsonArray } from '../lib/utils';

const router = Router();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ALLOWED_SETTINGS_KEYS = [
  'companyName',
  'currency',
  'defaultConfidence',
  'transportBufferDays',
  'maxVendorsPerStep',
  'workingDaysJson',
  'holidaysJson',
  'categoryPresets',
  'printTypePresets',
] as const;

function pickAllowedSettings(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_SETTINGS_KEYS) {
    if (key in body) data[key] = body[key];
  }
  return data;
}

function parseTagList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* fall through */
  }
  return raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ar')
  );
}

router.get('/settings', authMiddleware, requireView, async (_req, res) => {
  let settings = await prisma.globalSettings.findUnique({ where: { id: 'default' } });
  if (!settings) settings = await prisma.globalSettings.create({ data: { id: 'default' } });
  res.json(settings);
});

router.patch('/settings', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  const data = pickAllowedSettings(req.body);
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'لا توجد حقول مسموحة للتحديث' });
  }
  const settings = await prisma.globalSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...data },
    update: data,
  });
  await logAudit(req.user!.userId, 'UPDATE', 'GlobalSettings', 'default');
  res.json(settings);
});

router.get('/master-data/suggestions', authMiddleware, requireView, async (_req, res) => {
  const [factories, printingPlaces, settings] = await Promise.all([
    prisma.factory.findMany({ select: { categories: true } }),
    prisma.printingPlace.findMany({ select: { printTypes: true } }),
    prisma.globalSettings.findUnique({ where: { id: 'default' } }),
  ]);

  const categories = uniqueSorted([
    ...parseJsonArray<string>(settings?.categoryPresets ?? '[]'),
    ...factories.flatMap((f) => parseTagList(f.categories)),
  ]);
  const printTypes = uniqueSorted([
    ...parseJsonArray<string>(settings?.printTypePresets ?? '[]'),
    ...printingPlaces.flatMap((p) => parseTagList(p.printTypes)),
  ]);

  res.json({ categories, printTypes });
});

router.get('/master-data/export', authMiddleware, requireView, async (_req, res) => {
  const buffer = await exportMasterDataWorkbook();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=master-data.xlsx');
  res.send(Buffer.from(buffer));
});

router.get('/master-data/export-template', authMiddleware, requireView, async (_req, res) => {
  const buffer = await exportMasterDataTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=master-data-template.xlsx');
  res.send(Buffer.from(buffer));
});

router.post('/master-data/import', authMiddleware, requireAdmin, (req, res, next) => {
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    importUpload.single('file')(req, res, next);
  } else {
    next();
  }
}, async (req: AuthRequest, res) => {
  let buffer: Buffer;
  if (req.file) {
    buffer = req.file.buffer;
  } else if (req.body.fileBase64) {
    buffer = Buffer.from(req.body.fileBase64, 'base64');
  } else {
    return res.status(400).json({ error: 'file أو fileBase64 مطلوب' });
  }
  const result = await importMasterDataFromBuffer(buffer as unknown as import('exceljs').Buffer);
  await logAudit(req.user!.userId, 'IMPORT', 'MasterData', 'default');
  res.json(result);
});

router.get('/planning-runs/:runId/export', authMiddleware, requireView, async (req, res) => {
  const buffer = await exportPlanningResults(param(req.params.runId));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=planning-${req.params.runId}.xlsx`);
  res.send(Buffer.from(buffer));
});

router.get('/reports/vendor-scorecard', authMiddleware, requireView, async (_req, res) => {
  res.json(await getVendorScorecard());
});

router.get('/reports/estimate-accuracy', authMiddleware, requireView, async (_req, res) => {
  const actuals = await prisma.actualPerformance.findMany({ take: 100, orderBy: { recordedAt: 'desc' } });
  const summary = actuals.map((a) => ({
    vendorName: a.vendorName,
    plannedDays: a.plannedDays,
    actualDays: a.actualDays,
    dayDelta: a.actualDays - a.plannedDays,
    plannedCost: Number(a.plannedCost),
    actualCost: Number(a.actualCost),
    costDelta: Number(a.actualCost) - Number(a.plannedCost),
  }));
  res.json(summary);
});

router.get('/dashboard', authMiddleware, requireView, async (_req, res) => {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 86400000);

  const [dueThisWeek, atRisk, recentPdfs, pendingPlanning, byStatus] = await Promise.all([
    prisma.order.count({ where: { deadline: { lte: week, gte: now }, status: { notIn: ['COMPLETED', 'ARCHIVED'] } } }),
    prisma.order.count({ where: { deadline: { lte: new Date(now.getTime() + 3 * 86400000) }, status: { notIn: ['COMPLETED', 'ARCHIVED'] } } }),
    prisma.pdfExport.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { order: { select: { orderNo: true } } } }),
    prisma.order.count({ where: { status: 'DRAFT' } }),
    prisma.order.groupBy({ by: ['status'], _count: true }),
  ]);

  const scorecard = await getVendorScorecard();

  res.json({ dueThisWeek, atRisk, recentPdfs, pendingPlanning, byStatus, topVendors: scorecard.slice(0, 5) });
});

router.get('/audit-logs', authMiddleware, requireAdmin, async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, email: true } } },
    where: {
      ...(req.query.entityType ? { entityType: String(req.query.entityType) } : {}),
    },
  });
  res.json(logs);
});

router.get('/field-templates', authMiddleware, requireView, async (_req, res) => {
  const templates = await prisma.fieldTemplate.findMany({ include: { items: { orderBy: { sortOrder: 'asc' } } } });
  res.json(templates);
});

router.post('/field-templates', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  const { name, factoryId, items } = req.body;
  const template = await prisma.fieldTemplate.create({
    data: {
      name,
      factoryId: factoryId || null,
      items: {
        create: (items || []).map((item: { label: string; fieldType: string; sortOrder: number; isRequired?: boolean; options?: string }, i: number) => ({
          label: item.label,
          fieldType: item.fieldType,
          sortOrder: item.sortOrder ?? i,
          isRequired: Boolean(item.isRequired),
          options: item.options || null,
        })),
      },
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  await logAudit(req.user!.userId, 'CREATE', 'FieldTemplate', template.id);
  res.status(201).json(template);
});

router.get('/field-templates/:id', authMiddleware, requireView, async (req, res) => {
  const template = await prisma.fieldTemplate.findUnique({
    where: { id: param(req.params.id) },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!template) return res.status(404).json({ error: 'القالب غير موجود' });
  res.json(template);
});

router.patch('/field-templates/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const existing = await prisma.fieldTemplate.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'القالب غير موجود' });

  const { name, factoryId, items } = req.body;
  if (items) {
    await prisma.fieldTemplateItem.deleteMany({ where: { templateId: id } });
    await prisma.fieldTemplateItem.createMany({
      data: items.map((item: { label: string; fieldType: string; sortOrder: number; isRequired?: boolean; options?: string }, i: number) => ({
        templateId: id,
        label: item.label,
        fieldType: item.fieldType,
        sortOrder: item.sortOrder ?? i,
        isRequired: Boolean(item.isRequired),
        options: item.options || null,
      })),
    });
  }

  const template = await prisma.fieldTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(factoryId !== undefined ? { factoryId: factoryId || null } : {}),
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  await logAudit(req.user!.userId, 'UPDATE', 'FieldTemplate', id);
  res.json(template);
});

router.delete('/field-templates/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  const id = param(req.params.id);
  const existing = await prisma.fieldTemplate.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'القالب غير موجود' });
  await prisma.fieldTemplate.delete({ where: { id } });
  await logAudit(req.user!.userId, 'DELETE', 'FieldTemplate', id);
  res.status(204).send();
});

router.post('/orders/:orderId/apply-template/:templateId', authMiddleware, requireWrite, async (req, res) => {
  const orderId = param(req.params.orderId);
  const templateId = param(req.params.templateId);
  const template = await prisma.fieldTemplate.findUnique({
    where: { id: templateId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!template) return res.status(404).json({ error: 'القالب غير موجود' });

  await prisma.orderField.deleteMany({ where: { orderId } });
  await prisma.orderField.createMany({
    data: template.items.map((item) => ({
      orderId,
      label: item.label,
      value: '',
      fieldType: item.fieldType,
      sortOrder: item.sortOrder,
      isRequired: item.isRequired,
      options: item.options,
    })),
  });

  res.json({ ok: true });
});

router.post('/pdf-exports/:exportId/share', authMiddleware, async (req, res) => {
  const exportId = param(req.params.exportId);
  const record = await prisma.pdfExport.findUnique({
    where: { id: exportId },
    include: { order: true },
  });
  if (!record) return res.status(404).json({ error: 'التصدير غير موجود' });

  const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
  const link = `${baseUrl}/orders/${record.orderId}`;
  const downloadUrl = `${baseUrl}/api/v1/orders/${record.orderId}/pdf-exports/${exportId}/download`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`أمر إنتاج ${record.order.orderNo}: ${link}\n${downloadUrl}`)}`;
  const mailto = `mailto:?subject=${encodeURIComponent(`Production Order ${record.order.orderNo}`)}&body=${encodeURIComponent(`${link}\n${downloadUrl}`)}`;

  res.json({ link, downloadUrl, whatsapp, mailto, filename: record.filename });
});

export default router;
