export enum UserRole {
  ADMIN = 'ADMIN',
  PLANNER = 'PLANNER',
  PRODUCTION_MANAGER = 'PRODUCTION_MANAGER',
  VIEWER = 'VIEWER',
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  PLANNED = 'PLANNED',
  RELEASED = 'RELEASED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export enum ScenarioType {
  FASTEST_TIME = 'FASTEST_TIME',
  LOWEST_COST = 'LOWEST_COST',
  BALANCED = 'BALANCED',
  MOST_RELIABLE = 'MOST_RELIABLE',
  CUSTOM = 'CUSTOM',
}

export enum StepType {
  FABRIC = 'FABRIC',
  PRINT = 'PRINT',
  FACTORY = 'FACTORY',
}

export enum FieldType {
  TEXT = 'TEXT',
  DATE = 'DATE',
  NUMBER = 'NUMBER',
  TEXTAREA = 'TEXTAREA',
  DROPDOWN = 'DROPDOWN',
}

export enum VendorType {
  FACTORY = 'FACTORY',
  PRINTING_PLACE = 'PRINTING_PLACE',
  FABRIC_SUPPLIER = 'FABRIC_SUPPLIER',
}

export interface VendorBase {
  id: string;
  name: string;
  processingDays: number;
  costPerUnit: number;
  fixedCost: number;
  confidencePct: number;
  isActive: boolean;
  isSplittable: boolean;
  minSplitPct: number;
  maxSplits: number;
  capacityPerDay?: number | null;
  notes?: string | null;
}

export interface OrderFieldDto {
  id?: string;
  label: string;
  value: string;
  fieldType: FieldType;
  sortOrder: number;
  isRequired?: boolean;
  options?: string | null;
}

export interface MatrixCellDto {
  color: string;
  size: string;
  quantity: number;
}

export interface ScenarioComparisonRow {
  id: string;
  type: ScenarioType;
  label: string;
  totalDays: number;
  totalCost: number;
  certaintyPct: number;
  p50Days?: number;
  p90Days?: number;
  meetsDeadline: boolean;
  splitCount: number;
  vendorSummary: string;
  deadlineRiskPct?: number;
}

export const SCENARIO_LABELS: Record<ScenarioType, string> = {
  [ScenarioType.FASTEST_TIME]: 'أسرع وقت',
  [ScenarioType.LOWEST_COST]: 'أقل تكلفة',
  [ScenarioType.BALANCED]: 'متوازن',
  [ScenarioType.MOST_RELIABLE]: 'الأكثر موثوقية',
  [ScenarioType.CUSTOM]: 'مخصص',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.DRAFT]: 'مسودة',
  [OrderStatus.PLANNED]: 'مخطط',
  [OrderStatus.RELEASED]: 'صادر',
  [OrderStatus.IN_PRODUCTION]: 'قيد الإنتاج',
  [OrderStatus.COMPLETED]: 'مكتمل',
  [OrderStatus.ARCHIVED]: 'مؤرشف',
};

export const DEFAULT_ORDER_FIELDS: OrderFieldDto[] = [
  { label: 'رقم أمر الإنتاج', value: '', fieldType: FieldType.TEXT, sortOrder: 0 },
  { label: 'التاريخ', value: new Date().toISOString().split('T')[0], fieldType: FieldType.DATE, sortOrder: 1 },
  { label: 'اسم المصنع', value: '', fieldType: FieldType.TEXT, sortOrder: 2 },
  { label: 'نوع الموديل', value: '', fieldType: FieldType.TEXT, sortOrder: 3 },
  { label: 'خامة القماش', value: '', fieldType: FieldType.TEXT, sortOrder: 4 },
  { label: 'تعليمات', value: '', fieldType: FieldType.TEXTAREA, sortOrder: 5 },
];
