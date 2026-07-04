import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { FieldType } from '@production-ops/shared';

interface TemplateItem {
  id?: string;
  label: string;
  fieldType: FieldType;
  sortOrder: number;
  isRequired: boolean;
  options?: string | null;
}

interface Template {
  id: string;
  name: string;
  factoryId?: string | null;
  items: TemplateItem[];
}

interface Factory {
  id: string;
  name: string;
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  [FieldType.TEXT]: 'نص',
  [FieldType.DATE]: 'تاريخ',
  [FieldType.NUMBER]: 'رقم',
  [FieldType.TEXTAREA]: 'نص طويل',
  [FieldType.DROPDOWN]: 'قائمة',
};

const inputCls = 'rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm w-full';

function emptyItem(order: number): TemplateItem {
  return { label: '', fieldType: FieldType.TEXT, sortOrder: order, isRequired: false, options: null };
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [applyOrderId, setApplyOrderId] = useState('');
  const [applyTemplateId, setApplyTemplateId] = useState('');
  const [msg, setMsg] = useState('');

  async function loadTemplates() {
    setTemplates(await api<Template[]>('/field-templates'));
  }

  useEffect(() => {
    loadTemplates().catch(console.error);
    api<Factory[]>('/factories').then(setFactories).catch(console.error);
  }, []);

  function startCreate() {
    setEditing({ id: '', name: '', factoryId: null, items: [emptyItem(0), emptyItem(1)] });
    setExpanded(null);
  }

  async function startEdit(id: string) {
    const t = await api<Template>(`/field-templates/${id}`);
    setEditing({ ...t, items: t.items.map((it, i) => ({ ...it, sortOrder: it.sortOrder ?? i })) });
    setExpanded(id);
  }

  function updateItem(idx: number, patch: Partial<TemplateItem>) {
    if (!editing) return;
    const items = editing.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setEditing({ ...editing, items });
  }

  function addItem() {
    if (!editing) return;
    setEditing({ ...editing, items: [...editing.items, emptyItem(editing.items.length)] });
  }

  function removeItem(idx: number) {
    if (!editing) return;
    const items = editing.items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, sortOrder: i }));
    setEditing({ ...editing, items });
  }

  async function saveTemplate() {
    if (!editing || !editing.name.trim()) return;
    const payload = {
      name: editing.name,
      factoryId: editing.factoryId || null,
      items: editing.items.map((it, i) => ({
        label: it.label,
        fieldType: it.fieldType,
        sortOrder: i,
        isRequired: it.isRequired,
        options: it.fieldType === FieldType.DROPDOWN ? it.options || null : null,
      })),
    };
    if (editing.id) {
      await api(`/field-templates/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setMsg('تم تحديث القالب');
    } else {
      await api('/field-templates', { method: 'POST', body: JSON.stringify(payload) });
      setMsg('تم إنشاء القالب');
    }
    setEditing(null);
    loadTemplates();
  }

  async function deleteTemplate(id: string) {
    if (!confirm('حذف القالب؟')) return;
    await api(`/field-templates/${id}`, { method: 'DELETE' });
    if (expanded === id) setExpanded(null);
    if (editing?.id === id) setEditing(null);
    loadTemplates();
  }

  async function applyToOrder() {
    if (!applyOrderId.trim() || !applyTemplateId) return;
    await api(`/orders/${applyOrderId.trim()}/apply-template/${applyTemplateId}`, { method: 'POST' });
    setMsg('تم تطبيق القالب على الطلب');
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">قوالب حقول PDF</h2>
        <button type="button" onClick={startCreate} className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm">
          + قالب جديد
        </button>
      </div>
      {msg && <p className="text-xs text-emerald-400">{msg}</p>}

      {editing && (
        <section className="rounded-xl border border-zinc-700 p-4 bg-zinc-900 space-y-3">
          <h3 className="text-sm font-medium">{editing.id ? 'تعديل القالب' : 'قالب جديد'}</h3>
          <div className="grid md:grid-cols-2 gap-2">
            <input className={inputCls} placeholder="اسم القالب" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <select className={inputCls} value={editing.factoryId || ''} onChange={(e) => setEditing({ ...editing, factoryId: e.target.value || null })}>
              <option value="">— بدون مصنع —</option>
              {factories.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-zinc-500">الحقول</p>
            {editing.items.map((item, idx) => (
              <div key={idx} className="grid md:grid-cols-6 gap-2 items-center border border-zinc-800 rounded-lg p-2">
                <input className={inputCls} placeholder="التسمية" value={item.label} onChange={(e) => updateItem(idx, { label: e.target.value })} />
                <select className={inputCls} value={item.fieldType} onChange={(e) => updateItem(idx, { fieldType: e.target.value as FieldType })}>
                  {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={item.isRequired} onChange={(e) => updateItem(idx, { isRequired: e.target.checked })} />
                  مطلوب
                </label>
                {item.fieldType === FieldType.DROPDOWN ? (
                  <input className={`${inputCls} md:col-span-2`} placeholder="خيارات (مفصولة بفاصلة)" value={item.options || ''} onChange={(e) => updateItem(idx, { options: e.target.value })} />
                ) : (
                  <div className="md:col-span-2" />
                )}
                <button type="button" className="text-red-400 text-xs" onClick={() => removeItem(idx)} disabled={editing.items.length <= 1}>
                  حذف
                </button>
              </div>
            ))}
            <button type="button" onClick={addItem} className="text-xs text-zinc-400 hover:text-zinc-200">+ حقل</button>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={saveTemplate} className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm">حفظ</button>
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-zinc-700 text-sm">إلغاء</button>
          </div>
        </section>
      )}

      <ul className="text-sm space-y-2">
        {templates.map((t) => (
          <li key={t.id} className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between p-3 gap-2">
              <button type="button" className="flex-1 text-start" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                <span className="font-medium">{t.name}</span>
                <span className="text-zinc-500 mr-2"> — {t.items.length} حقول</span>
                {t.factoryId && (
                  <span className="text-[10px] text-zinc-500">
                    ({factories.find((f) => f.id === t.factoryId)?.name || 'مصنع'})
                  </span>
                )}
              </button>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-zinc-300" onClick={() => startEdit(t.id)}>تعديل</button>
                <button type="button" className="text-red-400" onClick={() => deleteTemplate(t.id)}>حذف</button>
              </div>
            </div>
            {expanded === t.id && (
              <ul className="border-t border-zinc-800 px-3 py-2 text-xs space-y-1 bg-zinc-950/50">
                {t.items.map((it, i) => (
                  <li key={it.id || i} className="flex justify-between">
                    <span>{it.label} ({FIELD_TYPE_LABELS[it.fieldType]}){it.isRequired ? ' *' : ''}</span>
                    <span className="text-zinc-500">#{it.sortOrder}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {templates.length === 0 && <li className="text-zinc-500 text-sm">لا توجد قوالب</li>}
      </ul>

      <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 space-y-2">
        <h3 className="text-sm font-medium">تطبيق قالب على طلب</h3>
        <div className="flex flex-wrap gap-2">
          <input className={`${inputCls} max-w-xs`} placeholder="معرّف الطلب (UUID)" value={applyOrderId} onChange={(e) => setApplyOrderId(e.target.value)} />
          <select className={`${inputCls} max-w-xs`} value={applyTemplateId} onChange={(e) => setApplyTemplateId(e.target.value)}>
            <option value="">— اختر قالب —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button type="button" onClick={applyToOrder} className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm">
            تطبيق
          </button>
        </div>
      </section>
    </div>
  );
}
