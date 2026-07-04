import { useEffect, useRef, useState } from 'react';
import { api, downloadBlob } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { canAdmin, canWrite } from '../lib/rbac';

interface Vendor {
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
  notes?: string | null;
  categories?: string | null;
  capacityPerDay?: number | null;
  printTypes?: string | null;
  moq?: number | null;
}

type Endpoint = 'factories' | 'printing-places' | 'fabric-suppliers';

const titles: Record<Endpoint, string> = {
  factories: 'المصانع',
  'printing-places': 'المطابع',
  'fabric-suppliers': 'موردو القماش',
};

const emptyForm = (): Partial<Vendor> => ({
  isActive: true,
  confidencePct: 80,
  fixedCost: 0,
  isSplittable: false,
  minSplitPct: 10,
  maxSplits: 2,
});

const inputCls = 'rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm w-full';

export default function VendorPage({ endpoint }: { endpoint: Endpoint }) {
  const { user } = useAuth();
  const write = user ? canWrite(user.role) : false;
  const admin = user ? canAdmin(user.role) : false;
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<Partial<Vendor>>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  async function load() {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    setRows(await api(`/${endpoint}${q}`));
  }

  useEffect(() => {
    load().catch(console.error);
  }, [endpoint, search]);

  function startEdit(row: Vendor) {
    setEditId(row.id);
    setForm({ ...row });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditId(null);
    setForm(emptyForm());
  }

  function buildPayload() {
    const base = {
      name: form.name,
      processingDays: Number(form.processingDays),
      costPerUnit: Number(form.costPerUnit),
      fixedCost: Number(form.fixedCost) || 0,
      confidencePct: Number(form.confidencePct) || 80,
      isActive: form.isActive !== false,
      isSplittable: Boolean(form.isSplittable),
      minSplitPct: Number(form.minSplitPct) || 10,
      maxSplits: Number(form.maxSplits) || 2,
      notes: form.notes || null,
    };
    if (endpoint === 'factories') {
      return { ...base, categories: form.categories || null, capacityPerDay: form.capacityPerDay ? Number(form.capacityPerDay) : null };
    }
    if (endpoint === 'printing-places') {
      return { ...base, printTypes: form.printTypes || null };
    }
    return { ...base, moq: form.moq ? Number(form.moq) : null };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload();
    if (editId) {
      await api(`/${endpoint}/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await api(`/${endpoint}`, { method: 'POST', body: JSON.stringify(payload) });
    }
    cancelEdit();
    load();
  }

  async function remove(id: string) {
    if (!confirm('حذف؟')) return;
    await api(`/${endpoint}/${id}`, { method: 'DELETE' });
    if (editId === id) cancelEdit();
    load();
  }

  async function duplicate(id: string) {
    await api(`/factories/${id}/duplicate`, { method: 'POST' });
    load();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] || result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await api<{ imported: number; updated: number; errors: string[] }>('/master-data/import', {
        method: 'POST',
        body: JSON.stringify({ fileBase64: base64 }),
      });
      const errPart = result.errors.length ? ` — أخطاء: ${result.errors.length}` : '';
      setImportMsg(`تم: ${result.imported} جديد، ${result.updated} محدّث${errPart}`);
      load();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'فشل الاستيراد');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function exportExcel() {
    downloadBlob('/master-data/export', 'master-data.xlsx').catch((err) =>
      setImportMsg(err instanceof Error ? err.message : 'فشل التصدير')
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{titles[endpoint]}</h2>

      <div className="flex gap-2 flex-wrap items-center">
        <input
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm flex-1 min-w-[200px]"
          placeholder="بحث..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={exportExcel} className="px-3 py-2 rounded-lg border border-zinc-700 text-xs">
          تصدير Excel
        </button>
        {admin && (
          <>
            <label className="px-3 py-2 rounded-lg border border-zinc-700 text-xs cursor-pointer">
              {importing ? 'جاري الاستيراد...' : 'استيراد Excel'}
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} disabled={importing} />
            </label>
          </>
        )}
      </div>
      {importMsg && <p className="text-xs text-zinc-400">{importMsg}</p>}

      {write && (
        <form onSubmit={save} className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 space-y-3">
          <p className="text-xs text-zinc-500">{editId ? 'تعديل سجل' : 'إضافة سجل جديد'}</p>
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-2">
            <input required placeholder="الاسم" className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input required type="number" step="0.1" placeholder="أيام المعالجة" className={inputCls} value={form.processingDays ?? ''} onChange={(e) => setForm({ ...form, processingDays: Number(e.target.value) })} />
            <input required type="number" step="0.01" placeholder="تكلفة/قطعة" className={inputCls} value={form.costPerUnit ?? ''} onChange={(e) => setForm({ ...form, costPerUnit: Number(e.target.value) })} />
            <input type="number" step="0.01" placeholder="تكلفة ثابتة" className={inputCls} value={form.fixedCost ?? 0} onChange={(e) => setForm({ ...form, fixedCost: Number(e.target.value) })} />
            <input type="number" placeholder="ثقة %" className={inputCls} value={form.confidencePct ?? 80} onChange={(e) => setForm({ ...form, confidencePct: Number(e.target.value) })} />
            <input type="number" placeholder="أقل نسبة تقسيم %" className={inputCls} value={form.minSplitPct ?? 10} onChange={(e) => setForm({ ...form, minSplitPct: Number(e.target.value) })} />
            <input type="number" placeholder="أقصى تقسيمات" className={inputCls} value={form.maxSplits ?? 2} onChange={(e) => setForm({ ...form, maxSplits: Number(e.target.value) })} />
            {endpoint === 'factories' && (
              <>
                <input placeholder="الفئات (مفصولة بفاصلة)" className={inputCls} value={form.categories || ''} onChange={(e) => setForm({ ...form, categories: e.target.value })} />
                <input type="number" placeholder="السعة/يوم" className={inputCls} value={form.capacityPerDay ?? ''} onChange={(e) => setForm({ ...form, capacityPerDay: e.target.value ? Number(e.target.value) : null })} />
              </>
            )}
            {endpoint === 'printing-places' && (
              <input placeholder="أنواع الطباعة" className={inputCls} value={form.printTypes || ''} onChange={(e) => setForm({ ...form, printTypes: e.target.value })} />
            )}
            {endpoint === 'fabric-suppliers' && (
              <input type="number" placeholder="الحد الأدنى للطلب MOQ" className={inputCls} value={form.moq ?? ''} onChange={(e) => setForm({ ...form, moq: e.target.value ? Number(e.target.value) : null })} />
            )}
            <textarea placeholder="ملاحظات" className={`${inputCls} md:col-span-2`} rows={1} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-4 text-xs items-center">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              نشط
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={Boolean(form.isSplittable)} onChange={(e) => setForm({ ...form, isSplittable: e.target.checked })} />
              قابل للتقسيم
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded bg-zinc-100 text-zinc-900 text-sm font-medium px-4 py-1.5">
              {editId ? 'حفظ التعديل' : '+ إضافة'}
            </button>
            {editId && (
              <button type="button" onClick={cancelEdit} className="rounded border border-zinc-700 text-sm px-4 py-1.5">
                إلغاء
              </button>
            )}
          </div>
        </form>
      )}

      <div className="rounded-xl border border-zinc-800 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-900 text-zinc-500">
            <tr>
              <th className="p-2 text-start">الاسم</th>
              <th className="p-2">أيام</th>
              <th className="p-2">تكلفة</th>
              <th className="p-2">ثابت</th>
              <th className="p-2">ثقة%</th>
              <th className="p-2">تقسيم</th>
              <th className="p-2">نشط</th>
              {endpoint === 'factories' && <th className="p-2">سعة/يوم</th>}
              {endpoint === 'fabric-suppliers' && <th className="p-2">MOQ</th>}
              {write && <th className="p-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-zinc-500">لا توجد سجلات</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-zinc-800 ${editId === r.id ? 'bg-zinc-800/50' : ''}`}>
                <td className="p-2">
                  <div>{r.name}</div>
                  {r.notes && <div className="text-[10px] text-zinc-500 truncate max-w-[160px]">{r.notes}</div>}
                </td>
                <td className="p-2 text-center">{r.processingDays}</td>
                <td className="p-2 text-center">{r.costPerUnit}</td>
                <td className="p-2 text-center">{r.fixedCost}</td>
                <td className="p-2 text-center">{r.confidencePct}</td>
                <td className="p-2 text-center">{r.isSplittable ? `${r.minSplitPct}%/${r.maxSplits}` : '—'}</td>
                <td className="p-2 text-center">{r.isActive ? '✓' : '—'}</td>
                {endpoint === 'factories' && <td className="p-2 text-center">{r.capacityPerDay ?? '—'}</td>}
                {endpoint === 'fabric-suppliers' && <td className="p-2 text-center">{r.moq ?? '—'}</td>}
                {write && (
                  <td className="p-2 whitespace-nowrap space-x-2 rtl:space-x-reverse">
                    <button type="button" className="text-zinc-300 hover:underline" onClick={() => startEdit(r)}>تعديل</button>
                    {endpoint === 'factories' && (
                      <button type="button" className="text-blue-400 hover:underline" onClick={() => duplicate(r.id)}>نسخ</button>
                    )}
                    <button type="button" className="text-red-400 hover:underline" onClick={() => remove(r.id)}>حذف</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
