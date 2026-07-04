import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FieldType,
  ORDER_STATUS_LABELS,
  OrderStatus,
  SCENARIO_LABELS,
  ScenarioType,
  UserRole,
} from '@production-ops/shared';
import { api, getToken } from '../lib/api';
import { downloadProductionPdf, pdfToBlob } from '../lib/pdf/generator';
import { canWrite, canPlan, canExportPdf } from '../lib/rbac';
import { useAuth } from '../hooks/useAuth';
import RouteGraph from '../components/RouteGraph';

interface OrderField {
  id: string;
  label: string;
  value: string;
  fieldType: FieldType;
  sortOrder: number;
  isRequired?: boolean;
  options?: string | null;
}

interface ScenarioStep {
  id: string;
  stepOrder: number;
  stepType: string;
  vendorId: string;
  vendorName: string;
  days: number;
  cost: number;
  startDate: string;
  endDate: string;
  splits: Array<{ vendorName: string; splitPct: number }>;
}

interface Scenario {
  id: string;
  type: ScenarioType;
  label?: string;
  totalDays: number;
  totalCost: number;
  certaintyPct: number;
  p50Days?: number;
  p90Days?: number;
  meetsDeadline: boolean;
  splitCount: number;
  deadlineRiskPct?: number | null;
  vendorSummary: string;
  steps: ScenarioStep[];
}

interface PlanningRun {
  id: string;
  createdAt: string;
  scenarios: Scenario[];
}

interface OrderDetail {
  id: string;
  orderNo: string;
  status: OrderStatus;
  deadline: string | null;
  notes: string | null;
  totalQty: number;
  colors: string[];
  sizes: string[];
  fields: OrderField[];
  matrixCells: Array<{ color: string; size: string; quantity: number }>;
  photos: Array<{ id: string; filename: string; path: string }>;
  planningRuns: PlanningRun[];
  selectedScenario?: Scenario | null;
  pdfExports: Array<{ id: string; filename: string; version: number; createdAt: string; user?: { name: string } }>;
  actualPerformances: Array<{
    id: string;
    vendorName: string;
    plannedDays: number;
    actualDays: number;
    plannedCost: number;
    actualCost: number;
  }>;
}

interface VendorOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface FieldTemplate {
  id: string;
  name: string;
}

type Tab = 'overview' | 'planning' | 'pdf' | 'execution' | 'history';

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.DRAFT]: [OrderStatus.PLANNED, OrderStatus.ARCHIVED],
  [OrderStatus.PLANNED]: [OrderStatus.DRAFT, OrderStatus.RELEASED, OrderStatus.ARCHIVED],
  [OrderStatus.RELEASED]: [OrderStatus.IN_PRODUCTION, OrderStatus.ARCHIVED],
  [OrderStatus.IN_PRODUCTION]: [OrderStatus.COMPLETED, OrderStatus.ARCHIVED],
  [OrderStatus.COMPLETED]: [OrderStatus.ARCHIVED],
  [OrderStatus.ARCHIVED]: [OrderStatus.DRAFT],
};

function parseDropdownOptions(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* comma-separated fallback */
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function formatDropdownOptions(opts: string[]): string {
  return opts.join(', ');
}

export default function OrderDetailPage({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const role = user?.role;
  const writable = role ? canWrite(role) : false;
  const plannable = role ? canPlan(role) : false;
  const pdfExportable = role ? canExportPdf(role) : false;
  const isAdmin = role === UserRole.ADMIN;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [saving, setSaving] = useState(false);
  const [planDeadline, setPlanDeadline] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [enableSplits, setEnableSplits] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [selectedGraph, setSelectedGraph] = useState<string | null>(null);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [deadlineRiskPct, setDeadlineRiskPct] = useState<number | null>(null);
  const [pdfName, setPdfName] = useState('production_order');
  const [orient, setOrient] = useState<'p' | 'l'>('p');
  const [inclPhotos, setInclPhotos] = useState(true);
  const [photoBlobs, setPhotoBlobs] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [customWeights, setCustomWeights] = useState({ time: 33, cost: 33, certainty: 34 });
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [factories, setFactories] = useState<VendorOption[]>([]);
  const [printingPlaces, setPrintingPlaces] = useState<VendorOption[]>([]);
  const [fabricSuppliers, setFabricSuppliers] = useState<VendorOption[]>([]);
  const [selectedFabricIds, setSelectedFabricIds] = useState<string[]>([]);
  const [selectedPrintIds, setSelectedPrintIds] = useState<string[]>([]);
  const [selectedFactoryIds, setSelectedFactoryIds] = useState<string[]>([]);

  const [actualsForm, setActualsForm] = useState<Record<string, { actualDays: string; actualCost: string }>>({});
  const [paretoFrontier, setParetoFrontier] = useState<Array<{ scenarioId?: string; label?: string; totalDays: number; totalCost: number; certaintyPct: number; isOnFrontier: boolean }>>([]);

  const load = useCallback(async () => {
    const data = await api<OrderDetail>(`/orders/${orderId}`);
    setOrder(data);
    setPlanDeadline(data.deadline ? data.deadline.split('T')[0] : '');
    setOrderNotes(data.notes || '');
    const run = data.planningRuns[0];
    if (run) {
      setSelectedRunId(run.id);
      setScenarios(run.scenarios);
    } else {
      setSelectedRunId('');
      setScenarios([]);
    }
    if (data.selectedScenario) setSelectedGraph(data.selectedScenario.id);
  }, [orderId]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    if (!order?.photos.length) {
      setPhotoBlobs([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      order.photos.map(async (p) => {
        const res = await fetch(`/api/v1/orders/${orderId}/photos/${p.id}/file`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      })
    ).then((urls) => {
      if (!cancelled) setPhotoBlobs(urls);
    });
    return () => {
      cancelled = true;
    };
  }, [order?.photos, orderId]);

  useEffect(() => {
    if (tab !== 'planning') return;
    api<{ riskPct: number }>(`/orders/${orderId}/deadline-risk`)
      .then((r) => setDeadlineRiskPct(r.riskPct))
      .catch(() => setDeadlineRiskPct(null));
  }, [tab, orderId, planDeadline]);

  useEffect(() => {
    if (tab !== 'planning' || !plannable) return;
    Promise.all([
      api<VendorOption[]>('/fabric-suppliers'),
      api<VendorOption[]>('/printing-places'),
      api<VendorOption[]>('/factories'),
    ])
      .then(([fab, pr, fac]) => {
        setFabricSuppliers(fab.filter((v) => v.isActive));
        setPrintingPlaces(pr.filter((v) => v.isActive));
        setFactories(fac.filter((v) => v.isActive));
      })
      .catch(console.error);
  }, [tab, plannable]);

  useEffect(() => {
    if (tab !== 'pdf') return;
    api<FieldTemplate[]>('/field-templates')
      .then(setTemplates)
      .catch(console.error);
  }, [tab]);

  useEffect(() => {
    if (!order?.selectedScenario) {
      setActualsForm({});
      return;
    }
    const initial: Record<string, { actualDays: string; actualCost: string }> = {};
    order.selectedScenario.steps.forEach((s) => {
      initial[s.id] = { actualDays: String(s.days), actualCost: String(s.cost) };
    });
    setActualsForm(initial);
  }, [order?.selectedScenario]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const matrix = useMemo(() => {
    const m: Record<string, number> = {};
    order?.matrixCells.forEach((c) => {
      m[`${c.color}|${c.size}`] = c.quantity;
    });
    return m;
  }, [order?.matrixCells]);

  const allowedStatuses = useMemo(() => {
    if (!order) return [];
    const next = STATUS_TRANSITIONS[order.status] || [];
    return [order.status, ...next.filter((s) => s !== order.status)];
  }, [order]);

  const compareScenarioA = scenarios.find((s) => s.id === compareA);
  const compareScenarioB = scenarios.find((s) => s.id === compareB);

  async function saveOrder(partial: Record<string, unknown>) {
    if (!writable) return;
    setSaving(true);
    try {
      await api(`/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify(partial) });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: OrderStatus) {
    if (!writable || !order || status === order.status) return;
    setSaving(true);
    try {
      await api(`/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'فشل تغيير الحالة');
    } finally {
      setSaving(false);
    }
  }

  function updateFieldValue(i: number, value: string) {
    if (!order || !writable) return;
    const fields = [...order.fields];
    fields[i] = { ...fields[i], value };
    setOrder({ ...order, fields });
  }

  function updateFieldMeta(i: number, patch: Partial<OrderField>) {
    if (!order || !writable) return;
    const fields = [...order.fields];
    fields[i] = { ...fields[i], ...patch };
    setOrder({ ...order, fields });
  }

  function moveField(i: number, dir: -1 | 1) {
    if (!order || !writable) return;
    const j = i + dir;
    if (j < 0 || j >= order.fields.length) return;
    const fields = [...order.fields];
    [fields[i], fields[j]] = [fields[j], fields[i]];
    fields.forEach((f, idx) => {
      f.sortOrder = idx;
    });
    setOrder({ ...order, fields });
  }

  function addField() {
    if (!order || !writable) return;
    setOrder({
      ...order,
      fields: [
        ...order.fields,
        {
          id: `new-${Date.now()}`,
          label: 'بند جديد',
          value: '',
          fieldType: FieldType.TEXT,
          sortOrder: order.fields.length,
          isRequired: false,
        },
      ],
    });
  }

  function removeField(i: number) {
    if (!order || !writable) return;
    const fields = order.fields.filter((_, idx) => idx !== i).map((f, idx) => ({ ...f, sortOrder: idx }));
    setOrder({ ...order, fields });
  }

  function addColor() {
    const v = prompt('اسم اللون');
    if (!v?.trim() || !order || !writable) return;
    if (order.colors.includes(v.trim())) return;
    setOrder({ ...order, colors: [...order.colors, v.trim()] });
  }

  function removeColor(color: string) {
    if (!order || !writable) return;
    const colors = order.colors.filter((c) => c !== color);
    const matrixCells = order.matrixCells.filter((c) => c.color !== color);
    const totalQty = matrixCells.reduce((s, c) => s + c.quantity, 0);
    setOrder({ ...order, colors, matrixCells, totalQty });
  }

  function addSize() {
    const v = prompt('المقاس');
    if (!v?.trim() || !order || !writable) return;
    if (order.sizes.includes(v.trim())) return;
    setOrder({ ...order, sizes: [...order.sizes, v.trim()] });
  }

  function removeSize(size: string) {
    if (!order || !writable) return;
    const sizes = order.sizes.filter((s) => s !== size);
    const matrixCells = order.matrixCells.filter((c) => c.size !== size);
    const totalQty = matrixCells.reduce((s, c) => s + c.quantity, 0);
    setOrder({ ...order, sizes, matrixCells, totalQty });
  }

  function setCell(color: string, size: string, quantity: number) {
    if (!order || !writable) return;
    const cells = [...order.matrixCells.filter((c) => !(c.color === color && c.size === size))];
    if (quantity > 0) cells.push({ color, size, quantity });
    const totalQty = cells.reduce((s, c) => s + c.quantity, 0);
    setOrder({ ...order, matrixCells: cells, totalQty });
  }

  function toggleVendorId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length || !writable) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('photos', f));
    await fetch(`/api/v1/orders/${orderId}/photos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    load();
  }

  async function deletePhoto(photoId: string) {
    if (!writable) return;
    if (!confirm('حذف الصورة؟')) return;
    await api(`/orders/${orderId}/photos/${photoId}`, { method: 'DELETE' });
    load();
  }

  async function applyTemplate() {
    if (!selectedTemplateId || !isAdmin) return;
    setSaving(true);
    try {
      await api(`/orders/${orderId}/apply-template/${selectedTemplateId}`, { method: 'POST' });
      setSelectedTemplateId('');
      await load();
      setStatusMsg('✓ تم تطبيق القالب');
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'فشل تطبيق القالب');
    } finally {
      setSaving(false);
    }
  }

  function selectPlanningRun(runId: string) {
    setSelectedRunId(runId);
    const run = order?.planningRuns.find((r) => r.id === runId);
    setScenarios(run?.scenarios || []);
    setCompareA('');
    setCompareB('');
    if (runId) {
      api<{ onFrontier: typeof paretoFrontier }>(`/planning-runs/${runId}/pareto`)
        .then((r) => setParetoFrontier(r.onFrontier || []))
        .catch(() => setParetoFrontier([]));
    } else {
      setParetoFrontier([]);
    }
  }

  async function runPlanning() {
    if (!plannable) return;
    const res = await api<{ scenarios: Scenario[] }>(`/orders/${orderId}/planning-runs`, {
      method: 'POST',
      body: JSON.stringify({
        deadline: planDeadline,
        quantity: order?.totalQty || 1,
        enableSplits,
        fabricIds: selectedFabricIds.length ? selectedFabricIds : undefined,
        printIds: selectedPrintIds.length ? selectedPrintIds : undefined,
        factoryIds: selectedFactoryIds.length ? selectedFactoryIds : undefined,
        customWeights: {
          time: customWeights.time / 100,
          cost: customWeights.cost / 100,
          certainty: customWeights.certainty / 100,
        },
      }),
    });
    setScenarios(res.scenarios);
    setTab('planning');
    load();
  }

  async function selectScenario(scenarioId: string) {
    if (!writable) return;
    await api(`/orders/${orderId}/select-scenario`, {
      method: 'POST',
      body: JSON.stringify({ scenarioId }),
    });
    setSelectedGraph(scenarioId);
    setTab('pdf');
    load();
  }

  async function buildPhotoDataUrls(): Promise<string[]> {
    const photoDataUrls: string[] = [];
    for (const url of photoBlobs) {
      const res = await fetch(url);
      const blob = await res.blob();
      photoDataUrls.push(
        await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        })
      );
    }
    return photoDataUrls;
  }

  function pdfOptions(photoDataUrls: string[]) {
    if (!order) throw new Error('no order');
    return {
      fields: order.fields,
      colors: order.colors,
      sizes: order.sizes,
      matrix,
      photos: inclPhotos ? photoDataUrls : [],
      orient,
      inclPhotos,
      orderNo: order.orderNo,
      orderId: order.id,
    };
  }

  async function openPdfPreview() {
    if (!order || !pdfExportable) return;
    setPreviewLoading(true);
    setStatusMsg('');
    try {
      const required = order.fields.filter((f) => f.isRequired && !f.value.trim());
      if (required.length) {
        setStatusMsg(`حقول مطلوبة: ${required.map((f) => f.label).join(', ')}`);
        return;
      }
      const photoDataUrls = await buildPhotoDataUrls();
      const blob = await pdfToBlob(pdfOptions(photoDataUrls));
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(URL.createObjectURL(blob));
      setShowPdfPreview(true);
    } catch (e) {
      setStatusMsg(`خطأ: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePdfPreview() {
    setShowPdfPreview(false);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  }

  async function exportPdf() {
    if (!order || !pdfExportable) return;
    setStatusMsg('جاري التصدير...');
    try {
      const required = order.fields.filter((f) => f.isRequired && !f.value.trim());
      if (required.length) {
        setStatusMsg(`حقول مطلوبة: ${required.map((f) => f.label).join(', ')}`);
        return;
      }

      const photoDataUrls = await buildPhotoDataUrls();
      const opts = pdfOptions(photoDataUrls);

      await downloadProductionPdf(`${pdfName}.pdf`, opts);

      const blob = await pdfToBlob(opts);
      const fd = new FormData();
      fd.append('pdf', blob, `${pdfName}.pdf`);
      fd.append('filename', `${pdfName}.pdf`);
      fd.append('orient', orient);
      fd.append('inclPhotos', String(inclPhotos));
      const uploadRes = await fetch(`/api/v1/orders/${orderId}/pdf-exports/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!uploadRes.ok) throw new Error('فشل رفع PDF');

      closePdfPreview();
      setStatusMsg('✓ تم التصدير بنجاح');
      load();
    } catch (e) {
      setStatusMsg(`خطأ: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  async function submitActuals() {
    if (!order?.selectedScenario || !writable) return;
    const items = order.selectedScenario.steps.map((step) => {
      const form = actualsForm[step.id] || { actualDays: String(step.days), actualCost: String(step.cost) };
      return {
        routeStepId: step.id,
        stepType: step.stepType,
        vendorType:
          step.stepType === 'FACTORY'
            ? 'FACTORY'
            : step.stepType === 'PRINT'
              ? 'PRINTING_PLACE'
              : 'FABRIC_SUPPLIER',
        vendorId: step.vendorId,
        vendorName: step.vendorName,
        plannedDays: step.days,
        actualDays: Number(form.actualDays) || step.days,
        plannedCost: step.cost,
        actualCost: Number(form.actualCost) || step.cost,
      };
    });
    setSaving(true);
    try {
      await api(`/orders/${orderId}/actuals`, { method: 'POST', body: JSON.stringify({ items }) });
      await load();
    } finally {
      setSaving(false);
    }
  }

  function renderVendorMultiSelect(
    label: string,
    vendors: VendorOption[],
    selected: string[],
    onToggle: (id: string) => void
  ) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-zinc-500">{label}</p>
        <div className="max-h-28 overflow-y-auto rounded border border-zinc-800 bg-zinc-950 p-2 space-y-1">
          {vendors.length === 0 && <p className="text-[10px] text-zinc-600">لا يوجد موردون</p>}
          {vendors.map((v) => (
            <label key={v.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(v.id)}
                disabled={!plannable}
                onChange={() => onToggle(v.id)}
              />
              {v.name}
            </label>
          ))}
        </div>
      </div>
    );
  }

  function renderScenarioCompareRow(label: string, a: string | number | boolean, b: string | number | boolean) {
    return (
      <tr className="border-t border-zinc-800">
        <td className="p-2 text-zinc-500">{label}</td>
        <td className="p-2 text-center">{String(a)}</td>
        <td className="p-2 text-center">{String(b)}</td>
      </tr>
    );
  }

  if (!order) return <p className="text-sm text-zinc-500">جاري التحميل...</p>;

  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: 'overview', label: 'نظرة عامة' },
    { id: 'planning', label: 'التخطيط', hidden: !plannable && !writable },
    { id: 'pdf', label: 'أمر الإنتاج PDF' },
    { id: 'execution', label: 'التنفيذ' },
    { id: 'history', label: 'السجل' },
  ];

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link to="/orders" className="text-xs text-zinc-500 hover:text-zinc-300 mb-1 inline-block">
            ← العودة للطلبات
          </Link>
          <h2 className="text-lg font-semibold">{order.orderNo}</h2>
          <p className="text-xs text-zinc-500">
            {ORDER_STATUS_LABELS[order.status] || order.status} · {order.totalQty} قطعة
          </p>
        </div>
        <span className="pill text-xs px-3 py-1 rounded-full border border-zinc-700">{order.totalQty} قطعة</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-zinc-500">الحالة</label>
        <select
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-xs"
          value={order.status}
          disabled={!writable || saving}
          onChange={(e) => changeStatus(e.target.value as OrderStatus)}
        >
          {allowedStatuses.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {!writable && <span className="text-[10px] text-zinc-600">عرض فقط</span>}
      </div>

      <div className="flex flex-wrap gap-1">
        {tabs
          .filter((t) => !t.hidden)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs ${tab === t.id ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 border border-zinc-800'}`}
            >
              {t.label}
            </button>
          ))}
      </div>

      {tab === 'overview' && (
        <section className="space-y-3 rounded-xl border border-zinc-800 p-4 bg-zinc-900">
          <label className="block text-xs text-zinc-500">
            الموعد النهائي
            <input
              type="date"
              disabled={!writable}
              className="mt-1 w-full rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm disabled:opacity-50"
              value={planDeadline}
              onChange={(e) => setPlanDeadline(e.target.value)}
            />
          </label>
          <label className="block text-xs text-zinc-500">
            ملاحظات الطلب
            <textarea
              disabled={!writable}
              className="mt-1 w-full rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm resize-none disabled:opacity-50"
              rows={3}
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="ملاحظات داخلية..."
            />
          </label>
          <button
            type="button"
            disabled={saving || !writable}
            onClick={() =>
              saveOrder({
                deadline: planDeadline,
                notes: orderNotes,
                fields: order.fields,
                colors: order.colors,
                sizes: order.sizes,
                matrixCells: order.matrixCells,
                totalQty: order.totalQty,
              })
            }
            className="w-full py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium disabled:opacity-40"
          >
            حفظ المسودة
          </button>
        </section>
      )}

      {tab === 'planning' && (
        <section className="space-y-4">
          {deadlineRiskPct !== null && (
            <div className="rounded-xl border border-zinc-800 p-3 bg-zinc-900 text-xs">
              <span className="text-zinc-500">مخاطر الموعد (Monte Carlo): </span>
              <span className={deadlineRiskPct > 50 ? 'text-red-400' : 'text-emerald-400'}>
                {deadlineRiskPct.toFixed(1)}%
              </span>
            </div>
          )}

          {plannable && (
            <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 space-y-3">
              {renderVendorMultiSelect('موردو القماش', fabricSuppliers, selectedFabricIds, (id) =>
                setSelectedFabricIds((prev) => toggleVendorId(prev, id))
              )}
              {renderVendorMultiSelect('المطابع', printingPlaces, selectedPrintIds, (id) =>
                setSelectedPrintIds((prev) => toggleVendorId(prev, id))
              )}
              {renderVendorMultiSelect('المصانع', factories, selectedFactoryIds, (id) =>
                setSelectedFactoryIds((prev) => toggleVendorId(prev, id))
              )}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={enableSplits}
                  onChange={(e) => setEnableSplits(e.target.checked)}
                />
                تفعيل تقسيم الطلب بين موردين
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <label>
                  وقت %
                  <input
                    type="number"
                    className="w-full mt-1 rounded bg-zinc-950 border border-zinc-800 px-2 py-1"
                    value={customWeights.time}
                    onChange={(e) => setCustomWeights({ ...customWeights, time: Number(e.target.value) })}
                  />
                </label>
                <label>
                  تكلفة %
                  <input
                    type="number"
                    className="w-full mt-1 rounded bg-zinc-950 border border-zinc-800 px-2 py-1"
                    value={customWeights.cost}
                    onChange={(e) => setCustomWeights({ ...customWeights, cost: Number(e.target.value) })}
                  />
                </label>
                <label>
                  ثقة %
                  <input
                    type="number"
                    className="w-full mt-1 rounded bg-zinc-950 border border-zinc-800 px-2 py-1"
                    value={customWeights.certainty}
                    onChange={(e) => setCustomWeights({ ...customWeights, certainty: Number(e.target.value) })}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={runPlanning}
                className="w-full py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm font-semibold"
              >
                تشغيل التخطيط (4+ سيناريوهات)
              </button>
            </div>
          )}

          {order.planningRuns.length > 0 && (
            <label className="block text-xs text-zinc-500">
              تشغيل التخطيط
              <select
                className="mt-1 w-full rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm"
                value={selectedRunId}
                onChange={(e) => selectPlanningRun(e.target.value)}
              >
                {order.planningRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {new Date(run.createdAt).toLocaleString('ar-EG')} — {run.scenarios.length} سيناريو
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-[11px]">
              <thead className="bg-zinc-900 text-zinc-500">
                <tr>
                  <th className="p-2 text-start">السيناريو</th>
                  <th className="p-2">أيام</th>
                  <th className="p-2">P50</th>
                  <th className="p-2">P90</th>
                  <th className="p-2">تكلفة</th>
                  <th className="p-2">ثقة</th>
                  <th className="p-2">تقسيم</th>
                  <th className="p-2">مخاطر</th>
                  <th className="p-2">موعد</th>
                  <th className="p-2">الموردون</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id} className="border-t border-zinc-800">
                    <td className="p-2">{SCENARIO_LABELS[s.type]}</td>
                    <td className="p-2 text-center">{s.totalDays}</td>
                    <td className="p-2 text-center">{s.p50Days ?? '-'}</td>
                    <td className="p-2 text-center">{s.p90Days ?? '-'}</td>
                    <td className="p-2 text-center">{Number(s.totalCost).toFixed(0)}</td>
                    <td className="p-2 text-center">{Number(s.certaintyPct).toFixed(0)}%</td>
                    <td className="p-2 text-center">{s.splitCount}</td>
                    <td className="p-2 text-center">
                      {s.deadlineRiskPct != null ? `${Number(s.deadlineRiskPct).toFixed(0)}%` : '-'}
                    </td>
                    <td className="p-2 text-center">{s.meetsDeadline ? '✓' : '✗'}</td>
                    <td className="p-2 max-w-[120px] truncate" title={s.vendorSummary}>
                      {s.vendorSummary}
                    </td>
                    <td className="p-2">
                      {writable ? (
                        <button type="button" className="text-emerald-400" onClick={() => selectScenario(s.id)}>
                          اختيار
                        </button>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {scenarios.length >= 2 && (
            <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 space-y-3">
              <p className="text-xs font-medium">مقارنة سيناريوهين</p>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-xs"
                  value={compareA}
                  onChange={(e) => setCompareA(e.target.value)}
                >
                  <option value="">اختر سيناريو A</option>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {SCENARIO_LABELS[s.type]}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-xs"
                  value={compareB}
                  onChange={(e) => setCompareB(e.target.value)}
                >
                  <option value="">اختر سيناريو B</option>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {SCENARIO_LABELS[s.type]}
                    </option>
                  ))}
                </select>
              </div>
              {compareScenarioA && compareScenarioB && (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-zinc-500">
                      <th className="p-2 text-start">المقياس</th>
                      <th className="p-2">{SCENARIO_LABELS[compareScenarioA.type]}</th>
                      <th className="p-2">{SCENARIO_LABELS[compareScenarioB.type]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderScenarioCompareRow('أيام', compareScenarioA.totalDays, compareScenarioB.totalDays)}
                    {renderScenarioCompareRow(
                      'تكلفة',
                      Number(compareScenarioA.totalCost).toFixed(0),
                      Number(compareScenarioB.totalCost).toFixed(0)
                    )}
                    {renderScenarioCompareRow(
                      'ثقة %',
                      Number(compareScenarioA.certaintyPct).toFixed(0),
                      Number(compareScenarioB.certaintyPct).toFixed(0)
                    )}
                    {renderScenarioCompareRow('تقسيم', compareScenarioA.splitCount, compareScenarioB.splitCount)}
                    {renderScenarioCompareRow(
                      'مخاطر %',
                      compareScenarioA.deadlineRiskPct != null
                        ? Number(compareScenarioA.deadlineRiskPct).toFixed(0)
                        : '-',
                      compareScenarioB.deadlineRiskPct != null
                        ? Number(compareScenarioB.deadlineRiskPct).toFixed(0)
                        : '-'
                    )}
                    {renderScenarioCompareRow(
                      'يلبي الموعد',
                      compareScenarioA.meetsDeadline ? '✓' : '✗',
                      compareScenarioB.meetsDeadline ? '✓' : '✗'
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {paretoFrontier.length > 0 && (
            <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900">
              <p className="text-xs font-medium mb-2">حد Pareto (سيناريوهات غير مهيمنة)</p>
              <ul className="text-[11px] space-y-1">
                {paretoFrontier.map((p) => (
                  <li key={p.scenarioId || p.label} className="flex justify-between gap-2 border-b border-zinc-800 pb-1">
                    <span>{p.label}</span>
                    <span className="text-zinc-500">{p.totalDays} يوم · {Number(p.totalCost).toFixed(0)} · {Number(p.certaintyPct).toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedGraph && <RouteGraph scenarioId={selectedGraph} />}

          {selectedRunId && (
            <a
              href={`/api/v1/planning-runs/${selectedRunId}/export`}
              className="text-xs text-zinc-400 underline"
              onClick={(e) => {
                e.preventDefault();
                fetch(`/api/v1/planning-runs/${selectedRunId}/export`, {
                  headers: { Authorization: `Bearer ${getToken()}` },
                })
                  .then((r) => r.blob())
                  .then((b) => {
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(b);
                    a.download = `planning-${order.orderNo}.xlsx`;
                    a.click();
                  });
              }}
            >
              تصدير Excel للنتائج
            </a>
          )}
        </section>
      )}

      {tab === 'pdf' && (
        <section className="space-y-3">
          {isAdmin && (
            <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 flex flex-wrap gap-2 items-end">
              <label className="flex-1 text-xs text-zinc-500">
                تطبيق قالب
                <select
                  className="mt-1 w-full rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                >
                  <option value="">— اختر قالب —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!selectedTemplateId || saving}
                onClick={applyTemplate}
                className="px-3 py-2 rounded-lg border border-zinc-700 text-xs disabled:opacity-40"
              >
                تطبيق
              </button>
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900">
            <div className="flex justify-between mb-3">
              <span className="text-xs font-medium">📋 بيانات الطلب</span>
              {writable && (
                <button type="button" onClick={addField} className="text-xs px-2 py-1 border border-zinc-700 rounded">
                  + إضافة
                </button>
              )}
            </div>
            {order.fields.map((f, i) => {
              const dropdownOpts = parseDropdownOptions(f.options);
              return (
                <div
                  key={f.id}
                  className="flex gap-2 mb-2 items-stretch border border-zinc-800 rounded-lg overflow-hidden"
                >
                  <div className="flex flex-col border-e border-zinc-800">
                    <button
                      type="button"
                      disabled={!writable || i === 0}
                      onClick={() => moveField(i, -1)}
                      className="px-2 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 text-[10px]"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={!writable || i === order.fields.length - 1}
                      onClick={() => moveField(i, 1)}
                      className="px-2 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 text-[10px]"
                    >
                      ↓
                    </button>
                    {writable && (
                      <button
                        type="button"
                        onClick={() => removeField(i)}
                        className="px-2 text-zinc-500 hover:text-red-400 text-[10px]"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="flex-1 py-2 pe-2 space-y-1">
                    {writable ? (
                      <>
                        <input
                          className="w-full bg-transparent text-[10px] text-zinc-500 outline-none border-b border-zinc-800"
                          value={f.label}
                          onChange={(e) => updateFieldMeta(i, { label: e.target.value })}
                        />
                        <div className="flex flex-wrap gap-2 items-center">
                          <select
                            className="rounded bg-zinc-950 border border-zinc-800 px-1 py-0.5 text-[10px]"
                            value={f.fieldType}
                            onChange={(e) => updateFieldMeta(i, { fieldType: e.target.value as FieldType })}
                          >
                            {Object.values(FieldType).map((ft) => (
                              <option key={ft} value={ft}>
                                {ft}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1 text-[10px] text-zinc-500">
                            <input
                              type="checkbox"
                              checked={Boolean(f.isRequired)}
                              onChange={(e) => updateFieldMeta(i, { isRequired: e.target.checked })}
                            />
                            مطلوب
                          </label>
                        </div>
                        {f.fieldType === FieldType.DROPDOWN && (
                          <input
                            className="w-full rounded bg-zinc-950 border border-zinc-800 px-2 py-0.5 text-[10px]"
                            placeholder="خيارات (مفصولة بفاصلة)"
                            value={formatDropdownOptions(dropdownOpts)}
                            onChange={(e) =>
                              updateFieldMeta(i, { options: formatDropdownOptions(e.target.value.split(',')) })
                            }
                          />
                        )}
                      </>
                    ) : (
                      <label className="text-[10px] text-zinc-500">
                        {f.label}
                        {f.isRequired && <span className="text-red-400"> *</span>}
                      </label>
                    )}
                    {f.fieldType === FieldType.TEXTAREA ? (
                      <textarea
                        disabled={!writable}
                        className="w-full bg-transparent text-sm outline-none resize-none disabled:opacity-60"
                        rows={2}
                        value={f.value}
                        onChange={(e) => updateFieldValue(i, e.target.value)}
                      />
                    ) : f.fieldType === FieldType.DATE ? (
                      <input
                        type="date"
                        disabled={!writable}
                        className="w-full bg-transparent text-sm outline-none disabled:opacity-60"
                        value={f.value}
                        onChange={(e) => updateFieldValue(i, e.target.value)}
                      />
                    ) : f.fieldType === FieldType.NUMBER ? (
                      <input
                        type="number"
                        disabled={!writable}
                        className="w-full bg-transparent text-sm outline-none disabled:opacity-60"
                        value={f.value}
                        onChange={(e) => updateFieldValue(i, e.target.value)}
                      />
                    ) : f.fieldType === FieldType.DROPDOWN ? (
                      <select
                        disabled={!writable}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm disabled:opacity-60"
                        value={f.value}
                        onChange={(e) => updateFieldValue(i, e.target.value)}
                      >
                        <option value="">—</option>
                        {dropdownOpts.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        disabled={!writable}
                        className="w-full bg-transparent text-sm outline-none disabled:opacity-60"
                        value={f.value}
                        onChange={(e) => updateFieldValue(i, e.target.value)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900">
            <p className="text-xs font-medium mb-2">📐 الألوان والمقاسات</p>
            {writable && (
              <div className="flex gap-2 mb-2">
                <button type="button" onClick={addColor} className="text-xs px-2 py-1 border border-zinc-700 rounded">
                  + لون
                </button>
                <button type="button" onClick={addSize} className="text-xs px-2 py-1 border border-zinc-700 rounded">
                  + مقاس
                </button>
              </div>
            )}
            {(order.colors.length > 0 || order.sizes.length > 0) && (
              <div className="flex flex-wrap gap-2 mb-3">
                {order.colors.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-zinc-700">
                    {c}
                    {writable && (
                      <button type="button" onClick={() => removeColor(c)} className="text-red-400">
                        ✕
                      </button>
                    )}
                  </span>
                ))}
                {order.sizes.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-zinc-700">
                    {s}
                    {writable && (
                      <button type="button" onClick={() => removeSize(s)} className="text-red-400">
                        ✕
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {order.colors.length > 0 && order.sizes.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse" dir="ltr">
                  <thead>
                    <tr>
                      <th className="border border-zinc-800 p-1">اللون</th>
                      {order.sizes.map((s) => (
                        <th key={s} className="border border-zinc-800 p-1">
                          {s}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.colors.map((col) => (
                      <tr key={col}>
                        <td className="border border-zinc-800 p-1 text-end" dir="rtl">
                          {col}
                        </td>
                        {order.sizes.map((s) => (
                          <td key={s} className="border border-zinc-800 p-0">
                            <input
                              type="number"
                              min={0}
                              disabled={!writable}
                              className="w-full text-center bg-transparent p-1 outline-none disabled:opacity-60"
                              value={matrix[`${col}|${s}`] || ''}
                              onChange={(e) => setCell(col, s, parseInt(e.target.value) || 0)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900">
            <p className="text-xs font-medium mb-2">🖼 صور الموديل</p>
            {writable && (
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => uploadPhotos(e.target.files)}
                className="text-xs w-full"
              />
            )}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {order.photos.map((p, i) => (
                <div key={p.id} className="relative">
                  <img
                    src={photoBlobs[i]}
                    alt={p.filename}
                    className="rounded-lg border border-zinc-800 max-h-40 object-cover w-full"
                  />
                  {writable && (
                    <button
                      type="button"
                      onClick={() => deletePhoto(p.id)}
                      className="absolute top-1 start-1 bg-zinc-900/80 text-red-400 text-[10px] px-1.5 py-0.5 rounded"
                    >
                      حذف
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 space-y-3">
            <p className="text-xs font-medium">📄 تصدير PDF</p>
            <input
              disabled={!pdfExportable}
              className="w-full rounded bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm disabled:opacity-50"
              value={pdfName}
              onChange={(e) => setPdfName(e.target.value)}
              placeholder="اسم الملف"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!pdfExportable}
                onClick={() => setOrient('p')}
                className={`py-2 rounded text-xs border disabled:opacity-50 ${orient === 'p' ? 'border-zinc-400' : 'border-zinc-800'}`}
              >
                ↕ عمودي
              </button>
              <button
                type="button"
                disabled={!pdfExportable}
                onClick={() => setOrient('l')}
                className={`py-2 rounded text-xs border disabled:opacity-50 ${orient === 'l' ? 'border-zinc-400' : 'border-zinc-800'}`}
              >
                ↔ أفقي
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                disabled={!pdfExportable}
                checked={inclPhotos}
                onChange={(e) => setInclPhotos(e.target.checked)}
              />
              تضمين الصور
            </label>
            {!pdfExportable && (
              <p className="text-[10px] text-zinc-600">ليس لديك صلاحية تصدير PDF</p>
            )}
            {pdfExportable && (
              <>
                <button
                  type="button"
                  disabled={previewLoading}
                  onClick={() => {
                    if (writable) {
                      saveOrder({
                        fields: order.fields,
                        colors: order.colors,
                        sizes: order.sizes,
                        matrixCells: order.matrixCells,
                        totalQty: order.totalQty,
                      }).then(openPdfPreview);
                    } else {
                      openPdfPreview();
                    }
                  }}
                  className="w-full py-2 rounded-lg border border-zinc-700 text-sm disabled:opacity-50"
                >
                  {previewLoading ? 'جاري المعاينة...' : '👁 معاينة PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (writable) {
                      saveOrder({
                        fields: order.fields,
                        colors: order.colors,
                        sizes: order.sizes,
                        matrixCells: order.matrixCells,
                        totalQty: order.totalQty,
                      }).then(exportPdf);
                    } else {
                      exportPdf();
                    }
                  }}
                  className="w-full py-3 rounded-lg bg-zinc-100 text-zinc-900 font-semibold text-sm"
                >
                  ⬇ تصدير PDF
                </button>
              </>
            )}
            {statusMsg && <p className="text-[11px] text-center text-zinc-500">{statusMsg}</p>}
          </div>
        </section>
      )}

      {tab === 'execution' && (
        <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 space-y-3">
          <p className="text-sm">تسجيل الأداء الفعلي بعد اكتمال الطلب</p>
          {order.selectedScenario ? (
            <div className="space-y-3">
              {order.selectedScenario.steps.map((s) => (
                <div key={s.id} className="border border-zinc-800 rounded p-3 space-y-2">
                  <p className="text-xs font-medium">
                    {s.stepType}: {s.vendorName}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    مخطط: {s.days} يوم · {Number(s.cost).toFixed(0)} تكلفة
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label>
                      أيام فعلية
                      <input
                        type="number"
                        min={0}
                        disabled={!writable}
                        className="w-full mt-1 rounded bg-zinc-950 border border-zinc-800 px-2 py-1 disabled:opacity-50"
                        value={actualsForm[s.id]?.actualDays ?? String(s.days)}
                        onChange={(e) =>
                          setActualsForm((prev) => ({
                            ...prev,
                            [s.id]: { ...prev[s.id], actualDays: e.target.value, actualCost: prev[s.id]?.actualCost ?? String(s.cost) },
                          }))
                        }
                      />
                    </label>
                    <label>
                      تكلفة فعلية
                      <input
                        type="number"
                        min={0}
                        disabled={!writable}
                        className="w-full mt-1 rounded bg-zinc-950 border border-zinc-800 px-2 py-1 disabled:opacity-50"
                        value={actualsForm[s.id]?.actualCost ?? String(s.cost)}
                        onChange={(e) =>
                          setActualsForm((prev) => ({
                            ...prev,
                            [s.id]: { ...prev[s.id], actualCost: e.target.value, actualDays: prev[s.id]?.actualDays ?? String(s.days) },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">اختر مساراً من التخطيط أولاً</p>
          )}
          <button
            type="button"
            disabled={!writable || saving || !order.selectedScenario}
            onClick={submitActuals}
            className="w-full py-2 rounded-lg border border-zinc-700 text-sm disabled:opacity-40"
          >
            حفظ الأرقام الفعلية
          </button>
          {order.actualPerformances.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th>المورد</th>
                  <th>مخطط/فعلي أيام</th>
                  <th>مخطط/فعلي تكلفة</th>
                </tr>
              </thead>
              <tbody>
                {order.actualPerformances.map((a) => (
                  <tr key={a.id}>
                    <td>{a.vendorName}</td>
                    <td>
                      {a.plannedDays}/{a.actualDays}
                    </td>
                    <td>
                      {a.plannedCost}/{a.actualCost}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'history' && (
        <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900">
          <h3 className="text-sm font-medium mb-3">سجل PDF</h3>
          <ul className="text-xs space-y-2">
            {order.pdfExports.map((p) => (
              <li key={p.id} className="flex justify-between items-center border-b border-zinc-800 pb-2 gap-2">
                <span>
                  v{p.version} — {p.filename}
                </span>
                <div className="flex gap-2 shrink-0">
                  <a
                    href={`/api/v1/orders/${orderId}/pdf-exports/${p.id}/download`}
                    className="text-blue-400"
                    onClick={(e) => {
                      e.preventDefault();
                      fetch(`/api/v1/orders/${orderId}/pdf-exports/${p.id}/download`, {
                        headers: { Authorization: `Bearer ${getToken()}` },
                      })
                        .then((r) => r.blob())
                        .then((b) => {
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(b);
                          a.download = p.filename;
                          a.click();
                        });
                    }}
                  >
                    تحميل
                  </a>
                  <button
                    type="button"
                    className="text-emerald-400"
                    onClick={async () => {
                      const share = await api<{ whatsapp: string; mailto: string }>(
                        `/pdf-exports/${p.id}/share`,
                        { method: 'POST' }
                      );
                      window.open(share.whatsapp, '_blank');
                    }}
                  >
                    واتساب
                  </button>
                  <button
                    type="button"
                    className="text-amber-400"
                    onClick={async () => {
                      const share = await api<{ whatsapp: string; mailto: string }>(
                        `/pdf-exports/${p.id}/share`,
                        { method: 'POST' }
                      );
                      window.location.href = share.mailto;
                    }}
                  >
                    بريد
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showPdfPreview && pdfPreviewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
              <span className="text-sm font-medium">معاينة PDF</span>
              <button type="button" onClick={closePdfPreview} className="text-zinc-400 hover:text-zinc-200 text-sm">
                ✕
              </button>
            </div>
            <iframe src={pdfPreviewUrl} title="PDF preview" className="flex-1 min-h-[60vh] w-full bg-white" />
            <div className="p-3 border-t border-zinc-800 flex gap-2">
              <button
                type="button"
                onClick={exportPdf}
                className="flex-1 py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm font-semibold"
              >
                ⬇ تأكيد التصدير
              </button>
              <button
                type="button"
                onClick={closePdfPreview}
                className="px-4 py-2 rounded-lg border border-zinc-700 text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
