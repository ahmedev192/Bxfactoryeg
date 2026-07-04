import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { canAdmin, ROLE_LABELS } from '../lib/rbac';
import { UserRole } from '@production-ops/shared';

interface Settings {
  companyName?: string;
  currency?: string;
  transportBufferDays?: number;
  defaultConfidence?: number;
  maxVendorsPerStep?: number;
  workingDaysJson?: string;
  holidaysJson?: string;
}

interface AuditLog {
  action: string;
  entityType: string;
  createdAt: string;
  user: { name: string };
}

const WEEKDAYS: { day: number; label: string }[] = [
  { day: 0, label: 'الأحد' },
  { day: 1, label: 'الإثنين' },
  { day: 2, label: 'الثلاثاء' },
  { day: 3, label: 'الأربعاء' },
  { day: 4, label: 'الخميس' },
  { day: 5, label: 'الجمعة' },
  { day: 6, label: 'السبت' },
];

const ENTITY_TYPES = ['Order', 'Factory', 'PrintingPlace', 'FabricSupplier', 'User', 'GlobalSettings', 'FieldTemplate'];

const inputCls = 'mt-1 w-full rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm';

function parseWorkingDays(json?: string): number[] {
  try {
    const d = JSON.parse(json || '[1,2,3,4,5]');
    return Array.isArray(d) ? d : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

function parseHolidays(json?: string): string[] {
  try {
    const h = JSON.parse(json || '[]');
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

export default function SettingsPage() {
  const { user } = useAuth();
  const admin = user ? canAdmin(user.role) : false;

  const [settings, setSettings] = useState<Settings>({});
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [newHoliday, setNewHoliday] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [entityFilter, setEntityFilter] = useState('');
  const [users, setUsers] = useState<Array<{ id: string; email: string; name: string; role: string }>>([]);
  const [userForm, setUserForm] = useState({ email: '', password: '', name: '', role: UserRole.VIEWER });
  const [userMsg, setUserMsg] = useState('');

  async function loadLogs() {
    const q = entityFilter ? `?entityType=${encodeURIComponent(entityFilter)}` : '';
    setLogs(await api<AuditLog[]>(`/audit-logs${q}`));
  }

  useEffect(() => {
    api<Settings>('/settings').then((s) => {
      setSettings(s);
      setWorkingDays(parseWorkingDays(s.workingDaysJson));
      setHolidays(parseHolidays(s.holidaysJson));
    }).catch(console.error);
    api<Array<{ id: string; email: string; name: string; role: string }>>('/auth/users').then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (admin) loadLogs().catch(() => {});
  }, [entityFilter, admin]);

  function toggleDay(day: number) {
    setWorkingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  function addHoliday() {
    if (!newHoliday || holidays.includes(newHoliday)) return;
    setHolidays([...holidays, newHoliday].sort());
    setNewHoliday('');
  }

  function removeHoliday(date: string) {
    setHolidays(holidays.filter((h) => h !== date));
  }

  async function save() {
    const payload = {
      ...settings,
      workingDaysJson: JSON.stringify(workingDays),
      holidaysJson: JSON.stringify(holidays),
    };
    await api('/settings', { method: 'PATCH', body: JSON.stringify(payload) });
    alert('تم الحفظ');
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setUserMsg('');
    try {
      const created = await api<{ id: string; email: string; name: string; role: string }>('/auth/users', {
        method: 'POST',
        body: JSON.stringify(userForm),
      });
      setUsers((prev) => [...prev, created]);
      setUserForm({ email: '', password: '', name: '', role: UserRole.VIEWER });
      setUserMsg('تم إنشاء المستخدم');
    } catch (err) {
      setUserMsg(err instanceof Error ? err.message : 'فشل الإنشاء');
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="text-lg font-semibold">الإعدادات</h2>

      <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 space-y-3 text-sm">
        <label className="block text-xs text-zinc-500">
          اسم الشركة
          <input className={inputCls} value={String(settings.companyName || '')} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} />
        </label>
        <label className="block text-xs text-zinc-500">
          العملة
          <input className={inputCls} value={String(settings.currency || 'EGP')} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} />
        </label>
        <label className="block text-xs text-zinc-500">
          أيام النقل بين المراحل
          <input type="number" className={inputCls} value={Number(settings.transportBufferDays || 1)} onChange={(e) => setSettings({ ...settings, transportBufferDays: Number(e.target.value) })} />
        </label>
        <label className="block text-xs text-zinc-500">
          الثقة الافتراضية %
          <input type="number" className={inputCls} value={Number(settings.defaultConfidence || 80)} onChange={(e) => setSettings({ ...settings, defaultConfidence: Number(e.target.value) })} />
        </label>
        <label className="block text-xs text-zinc-500">
          أقصى موردين لكل مرحلة
          <input type="number" className={inputCls} value={Number(settings.maxVendorsPerStep || 2)} onChange={(e) => setSettings({ ...settings, maxVendorsPerStep: Number(e.target.value) })} />
        </label>

        <div>
          <p className="text-xs text-zinc-500 mb-2">أيام العمل</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map(({ day, label }) => (
              <label key={day} className="flex items-center gap-1.5 text-xs rounded-lg border border-zinc-800 px-2 py-1.5 cursor-pointer">
                <input type="checkbox" checked={workingDays.includes(day)} onChange={() => toggleDay(day)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-zinc-500 mb-2">العطلات</p>
          <div className="flex gap-2 mb-2">
            <input type="date" className={inputCls + ' mt-0'} value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} />
            <button type="button" onClick={addHoliday} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs shrink-0">+ إضافة</button>
          </div>
          <ul className="text-xs space-y-1">
            {holidays.length === 0 && <li className="text-zinc-500">لا توجد عطلات</li>}
            {holidays.map((h) => (
              <li key={h} className="flex justify-between items-center rounded bg-zinc-950 px-2 py-1">
                <span>{h}</span>
                <button type="button" className="text-red-400" onClick={() => removeHoliday(h)}>حذف</button>
              </li>
            ))}
          </ul>
        </div>

        {admin && (
          <button type="button" onClick={save} className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium">
            حفظ
          </button>
        )}
      </section>

      {admin && (
        <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 space-y-3">
          <h3 className="text-sm font-medium">إضافة مستخدم</h3>
          <form onSubmit={createUser} className="grid gap-2 text-sm">
            <input required type="email" placeholder="البريد" className={inputCls + ' mt-0'} value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
            <input required type="password" placeholder="كلمة المرور" className={inputCls + ' mt-0'} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
            <input required placeholder="الاسم" className={inputCls + ' mt-0'} value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
            <select className={inputCls + ' mt-0'} value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button type="submit" className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium w-fit">+ مستخدم</button>
          </form>
          {userMsg && <p className="text-xs text-zinc-400">{userMsg}</p>}
        </section>
      )}

      {users.length > 0 && (
        <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900">
          <h3 className="text-sm font-medium mb-2">المستخدمون</h3>
          <ul className="text-xs space-y-1">
            {users.map((u) => (
              <li key={u.id}>{u.name} — {u.email} ({ROLE_LABELS[u.role as UserRole] || u.role})</li>
            ))}
          </ul>
        </section>
      )}

      {admin && (
        <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <h3 className="text-sm font-medium">سجل التدقيق</h3>
            <select className="rounded bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">كل الأنواع</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <ul className="text-[10px] space-y-1 max-h-48 overflow-y-auto">
            {logs.length === 0 && <li className="text-zinc-500">لا توجد سجلات</li>}
            {logs.map((l, i) => (
              <li key={i}>{l.createdAt.split('T')[0]} — {l.user.name}: {l.action} {l.entityType}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
