import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ORDER_STATUS_LABELS, OrderStatus } from '@production-ops/shared';

interface DashboardData {
  dueThisWeek: number;
  atRisk: number;
  pendingPlanning: number;
  recentPdfs: Array<{ id: string; filename: string; createdAt: string; order: { orderNo: string } }>;
  topVendors: Array<{ vendorName: string; confidencePct: unknown; sampleCount: number }>;
  byStatus: Array<{ status: string; _count: number }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api<DashboardData>('/dashboard').then(setData).catch(console.error);
  }, []);

  if (!data) return <p className="text-sm text-zinc-500">جاري التحميل...</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">لوحة التحكم</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-[10px] text-zinc-500">مستحق هذا الأسبوع</p>
          <p className="text-xl font-semibold mt-1 text-amber-400">{data.dueThisWeek}</p>
        </div>
        <Link to="/orders" className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-red-800/50 transition-colors">
          <p className="text-[10px] text-zinc-500">طلبات معرضة للخطر</p>
          <p className="text-xl font-semibold mt-1 text-red-400">{data.atRisk}</p>
        </Link>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-[10px] text-zinc-500">بانتظار التخطيط</p>
          <p className="text-xl font-semibold mt-1 text-blue-400">{data.pendingPlanning}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-[10px] text-zinc-500">أفضل مورد (عينة)</p>
          <p className="text-xl font-semibold mt-1 text-emerald-400 truncate">{data.topVendors[0]?.vendorName || '-'}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium mb-3">حسب الحالة</h3>
          <ul className="space-y-1 text-xs">
            {data.byStatus.map((s) => (
              <li key={s.status} className="flex justify-between">
                <span>{ORDER_STATUS_LABELS[s.status as OrderStatus] || s.status}</span>
                <span className="text-zinc-400">{s._count}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium mb-3">آخر ملفات PDF</h3>
          <ul className="space-y-2 text-xs">
            {data.recentPdfs.length === 0 && <li className="text-zinc-500">لا توجد ملفات</li>}
            {data.recentPdfs.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.order.orderNo}</span>
                <span className="text-zinc-500">{p.filename}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Link to="/orders" className="inline-block text-sm px-4 py-2 rounded-lg bg-zinc-100 text-zinc-900 font-medium">
        عرض الطلبات
      </Link>
    </div>
  );
}
