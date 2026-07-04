import { FieldType, OrderStatus, UserRole, VendorType, StepType } from '@prisma/client';
import { z } from 'zod';

const trimmed = z.string().trim();
const optionalText = z.union([trimmed.max(5000), z.literal(''), z.null()]).optional();
const id = trimmed.min(1).max(120);
const jsonArrayString = z.string().refine((value) => {
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}, 'يجب أن تكون القيمة مصفوفة JSON');

export const loginSchema = z.object({
  email: trimmed.email(),
  password: z.string().min(1).max(200),
});

export const createUserSchema = z.object({
  email: trimmed.email(),
  password: z.string().min(8).max(200),
  name: trimmed.min(1).max(120),
  role: z.nativeEnum(UserRole),
});

export const updateUserSchema = z
  .object({
    name: trimmed.min(1).max(120).optional(),
    role: z.nativeEnum(UserRole).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'name أو role أو isActive أو password مطلوب');

export const vendorCreateSchema = z.object({
  name: trimmed.min(1).max(180),
  processingDays: z.coerce.number().positive().max(3650),
  costPerUnit: z.coerce.number().min(0).max(1_000_000),
  fixedCost: z.coerce.number().min(0).max(100_000_000).default(0),
  confidencePct: z.coerce.number().min(0).max(100).default(80),
  isActive: z.boolean().default(true),
  isSplittable: z.boolean().default(false),
  minSplitPct: z.coerce.number().min(1).max(100).default(10),
  maxSplits: z.coerce.number().int().min(1).max(10).default(2),
  notes: optionalText,
  categories: optionalText,
  capacityPerDay: z.coerce.number().int().positive().nullable().optional(),
  printTypes: optionalText,
  moq: z.coerce.number().int().positive().nullable().optional(),
});

export const vendorPatchSchema = vendorCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'لا توجد حقول للتحديث'
);

const orderFieldSchema = z.object({
  id: trimmed.optional(),
  label: trimmed.min(1).max(120),
  value: z.coerce.string().max(10000).default(''),
  fieldType: z.nativeEnum(FieldType).default(FieldType.TEXT),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isRequired: z.boolean().optional(),
  options: z.union([trimmed.max(5000), z.literal(''), z.null()]).optional(),
});

const matrixCellSchema = z.object({
  color: trimmed.min(1).max(80),
  size: trimmed.min(1).max(80),
  quantity: z.coerce.number().int().min(0).max(10_000_000),
});

export const createOrderSchema = z.object({
  orderNo: trimmed.min(1).max(80).optional(),
  deadline: z.coerce.date().nullable().optional(),
  category: optionalText,
  requiredPrintType: optionalText,
});

export const patchOrderSchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  deadline: z.coerce.date().nullable().optional(),
  notes: optionalText,
  colors: z.array(trimmed.min(1).max(80)).max(200).optional(),
  sizes: z.array(trimmed.min(1).max(80)).max(200).optional(),
  fields: z.array(orderFieldSchema).max(200).optional(),
  matrixCells: z.array(matrixCellSchema).max(5000).optional(),
  totalQty: z.coerce.number().int().min(0).max(100_000_000).optional(),
  category: optionalText,
  requiredPrintType: optionalText,
});

export const orderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

const weightsSchema = z
  .object({
    time: z.coerce.number().min(0),
    cost: z.coerce.number().min(0),
    certainty: z.coerce.number().min(0),
  })
  .refine((value) => value.time + value.cost + value.certainty > 0, 'الأوزان يجب أن تكون أكبر من صفر');

export const planningRunSchema = z.object({
  deadline: z.coerce.date().optional(),
  quantity: z.coerce.number().int().positive().max(100_000_000).optional(),
  fabricIds: z.array(id).max(100).optional(),
  printIds: z.array(id).max(100).optional(),
  factoryIds: z.array(id).max(100).optional(),
  enableSplits: z.boolean().optional(),
  customWeights: weightsSchema.optional(),
  orderCategory: optionalText,
  requiredPrintType: optionalText,
  workflowId: id.optional(),
  enabledStageIds: z.array(id).max(200).optional(),
  candidateProcessIdsByStage: z.record(id, z.array(id).max(100)).optional(),
  splitSharesByStage: z.record(id, z.record(id, z.coerce.number().min(0).max(100))).optional(),
  monteCarloTrials: z.coerce.number().int().min(100).max(20000).optional(),
  maxScenarios: z.coerce.number().int().min(1).max(20).optional(),
});

export const selectScenarioSchema = z.object({
  scenarioId: id,
});

export const actualItemSchema = z.object({
  routeStepId: id.optional().nullable(),
  stepType: z.nativeEnum(StepType),
  vendorType: z.nativeEnum(VendorType),
  vendorId: id,
  vendorName: trimmed.min(1).max(180),
  plannedDays: z.coerce.number().int().min(0).max(3650),
  actualDays: z.coerce.number().int().min(0).max(3650),
  plannedCost: z.coerce.number().min(0).max(100_000_000),
  actualCost: z.coerce.number().min(0).max(100_000_000),
  actualCompletionDate: z.coerce.date().optional().nullable(),
  notes: optionalText,
});

export const actualsSchema = z.union([
  actualItemSchema,
  z.object({ items: z.array(actualItemSchema).min(1).max(200) }),
]);

export const pdfExportSchema = z.object({
  filename: trimmed.min(1).max(180).default('production_order.pdf'),
  orient: z.enum(['p', 'l']).default('p'),
  inclPhotos: z.boolean().default(true),
});

export const settingsPatchSchema = z
  .object({
    companyName: trimmed.min(1).max(180).optional(),
    currency: trimmed.min(1).max(20).optional(),
    defaultConfidence: z.coerce.number().min(0).max(100).optional(),
    transportBufferDays: z.coerce.number().int().min(0).max(365).optional(),
    maxVendorsPerStep: z.coerce.number().int().min(1).max(10).optional(),
    workingDaysJson: jsonArrayString.optional(),
    holidaysJson: jsonArrayString.optional(),
    categoryPresets: jsonArrayString.optional(),
    printTypePresets: jsonArrayString.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'لا توجد حقول مسموحة للتحديث');

export const fieldTemplateItemSchema = z.object({
  label: trimmed.min(1).max(120),
  fieldType: z.nativeEnum(FieldType).default(FieldType.TEXT),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isRequired: z.boolean().optional(),
  options: z.union([trimmed.max(5000), z.literal(''), z.null()]).optional(),
});

export const fieldTemplateSchema = z.object({
  name: trimmed.min(1).max(180),
  factoryId: id.nullable().optional(),
  items: z.array(fieldTemplateItemSchema).min(1).max(200),
});

export const fieldTemplatePatchSchema = fieldTemplateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'لا توجد حقول للتحديث'
);

export const stageSchema = z.object({
  name: trimmed.min(1).max(120),
  description: optionalText,
  isActive: z.boolean().default(true),
});

export const stagePatchSchema = stageSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'لا توجد حقول للتحديث'
);

export const workflowStepSchema = z.object({
  sortOrder: z.coerce.number().int().min(0).max(1000),
  stageIds: z.array(id).min(1).max(20),
});

export const workflowSchema = z.object({
  name: trimmed.min(1).max(180),
  description: optionalText,
  isActive: z.boolean().default(true),
  steps: z.array(workflowStepSchema).min(1).max(100),
});

export const workflowPatchSchema = workflowSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'لا توجد حقول للتحديث'
);

export const quantityThresholdSchema = z.object({
  minQty: z.coerce.number().int().positive(),
  addDays: z.coerce.number().min(0).max(3650),
});

export const processResourceSchema = z.object({
  name: trimmed.min(1).max(180),
  stageId: id,
  timeOptimistic: z.coerce.number().positive().max(3650),
  timeMostLikely: z.coerce.number().positive().max(3650),
  timePessimistic: z.coerce.number().positive().max(3650),
  cost: z.coerce.number().min(0).max(100_000_000),
  costType: z.enum(['PER_UNIT', 'FIXED']).default('PER_UNIT'),
  confidencePct: z.coerce.number().min(0).max(100).default(80),
  isActive: z.boolean().default(true),
  isSplittable: z.boolean().default(false),
  minSplitPct: z.coerce.number().min(1).max(100).default(10),
  maxSplits: z.coerce.number().int().min(1).max(10).default(2),
  notes: optionalText,
  thresholds: z.array(quantityThresholdSchema).max(100).default([]),
});

export const processResourcePatchSchema = processResourceSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'لا توجد حقول للتحديث'
);
