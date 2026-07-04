import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ORDER_STATUS_LABELS, OrderStatus } from '@production-ops/shared';
import { useAuth } from '../hooks/useAuth';
import { canWrite } from '../lib/rbac';

interface OrderRow {
  id: string;
  orderNo: string;
  status: OrderStatus;
  totalQty: number;
  deadline: string | null;
  updatedAt: string;
}

interface SavedFilters {
  search: string;
  status: string;
  from: string;
  to: string;
}

const STORAGE_KEY = 'orders-filters';

function loadSavedFilters(): SavedFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { search: '', status: '', from: '', to: '' };
}

export default function OrdersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const write = user ? canWrite(user.role) : false;

  const saved = loadSavedFilters();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState(saved.search);
  const [status, setStatus] = useState(saved.status);
  const [from, setFrom] = useState(saved.from);
  const [to, setTo] = useState(saved.to);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const q = params.toString() ? `?${params.toString()}` : '';
      setOrders(await api(`/orders${q}`));
    } finally {
      setLoading(false);
    }
  }, [search, status, from, to]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ search, status, from, to }));
  }, [search, status, from, to]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  async function createOrder() {
    setCreating(true);
    try {
      const order = await api<{ id: string }>('/orders', { method: 'POST', body: '{}' });
      navigate(`/orders/${order.id}`);
    } finally {
      setCreating(false);
    }
  }

  function clearFilters() {
    setSearch('');
    setStatus('');
    setFrom('');
    setTo('');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">الطلبات</h2>
        {write && (
          <button
            type="button"
            onClick={createOrder}
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium disabled:opacity-50"
          >
            {creating ? 'جاري الإنشاء...' : '+ طلب جديد'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <input
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm flex-1 min-w-[180px]"
          placeholder="بحث برقم الطلب..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">كل الحالات</option>
          {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="text-xs text-zinc-500">
          من
          <input type="date" className="block rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-sm mt-0.5" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-zinc-500">
          إلى
          <input type="date" className="block rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-sm mt-0.5" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(search || status || from || to) && (
          <button type="button" onClick={clearFilters} className="px-3 py-2 rounded-lg border border-zinc-700 text-xs">
            مسح الفلاتر
          </button>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-zinc-500">جاري التحميل...</p>
        ) : orders.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">لا توجد طلبات</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-zinc-900 text-zinc-500">
              <tr>
                <th className="text-start p-3">رقم الطلب</th>
                <th className="text-start p-3">الحالة</th>
                <th className="text-start p-3">الكمية</th>
                <th className="text-start p-3">الموعد</th>
                <th className="text-start p-3">آخر تحديث</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="p-3">
                    <Link to={`/orders/${o.id}`} className="text-zinc-100 hover:underline">
                      {o.orderNo}
                    </Link>
                  </td>
                  <td className="p-3">{ORDER_STATUS_LABELS[o.status] || o.status}</td>
                  <td className="p-3">{o.totalQty}</td>
                  <td className="p-3">{o.deadline ? o.deadline.split('T')[0] : '-'}</td>
                  <td className="p-3 text-zinc-500">{o.updatedAt.split('T')[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
