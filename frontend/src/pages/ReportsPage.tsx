import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function ReportsPage() {
  const [scorecard, setScorecard] = useState<Array<{ vendorName: string; confidencePct: unknown; meanDays: unknown; sampleCount: number }>>([]);
  const [accuracy, setAccuracy] = useState<Array<{ vendorName: string; dayDelta: number; costDelta: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<Array<{ vendorName: string; confidencePct: unknown; meanDays: unknown; sampleCount: number }>>('/reports/vendor-scorecard'),
      api<Array<{ vendorName: string; dayDelta: number; costDelta: number }>>('/reports/estimate-accuracy'),
    ])
      .then(([s, a]) => {
        setScorecard(s);
        setAccuracy(a);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(
    () => accuracy.slice(0, 12).map((a) => ({ name: a.vendorName.slice(0, 12), dayDelta: a.dayDelta, costDelta: a.costDelta })),
    [accuracy]
  );

  function exportCsv() {
    const rows = [['vendor', 'dayDelta', 'costDelta'], ...accuracy.map((a) => [a.vendorName, a.dayDelta, a.costDelta])];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'estimate-accuracy.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="text-sm text-zinc-500">جاري التحميل...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">التقارير</h2>
        <button type="button" onClick={exportCsv} className="text-xs px-3 py-1.5 border border-zinc-700 rounded-lg">
          تصدير CSV
        </button>
      </div>

      {chartData.length > 0 && (
        <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900">
          <h3 className="text-sm font-medium mb-3">اتجاه فرق الأيام (فعلي − مخطط)</h3>
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }} />
                <Bar dataKey="dayDelta" fill="#6366f1" name="فرق أيام" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900">
        <h3 className="text-sm font-medium mb-3">بطاقة أداء الموردين</h3>
        {scorecard.length === 0 ? (
          <p className="text-xs text-zinc-500">لا توجد بيانات بعد</p>
        ) : (
          <table className="w-full text-xs">
            <thead><tr><th className="text-start p-2">المورد</th><th>ثقة</th><th>متوسط أيام</th><th>عينات</th></tr></thead>
            <tbody>
              {scorecard.map((v, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="p-2">{v.vendorName}</td>
                  <td className="p-2 text-center">{Number(v.confidencePct).toFixed(0)}%</td>
                  <td className="p-2 text-center">{Number(v.meanDays).toFixed(1)}</td>
                  <td className="p-2 text-center">{v.sampleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900">
        <h3 className="text-sm font-medium mb-3">دقة التقدير (فعلي − مخطط)</h3>
        {accuracy.length === 0 ? (
          <p className="text-xs text-zinc-500">سجّل الأداء الفعلي من صفحة الطلب لتعبئة هذا التقرير</p>
        ) : (
          <table className="w-full text-xs">
            <thead><tr><th className="text-start p-2">المورد</th><th>فرق أيام</th><th>فرق تكلفة</th></tr></thead>
            <tbody>
              {accuracy.map((a, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="p-2">{a.vendorName}</td>
                  <td className={`p-2 text-center ${a.dayDelta > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{a.dayDelta}</td>
                  <td className={`p-2 text-center ${a.costDelta > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{a.costDelta.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
