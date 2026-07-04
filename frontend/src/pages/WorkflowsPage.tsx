import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { canWrite } from '../lib/rbac';

interface Stage {
  id: string;
  name: string;
  isActive: boolean;
}

interface Workflow {
  id: string;
  name: string;
  isActive: boolean;
  steps: Array<{ sortOrder: number; stages: Array<{ stage: Stage }> }>;
}

interface ProcessResource {
  id: string;
  name: string;
  stageId: string;
  stage?: Stage;
  timeOptimistic: number;
  timeMostLikely: number;
  timePessimistic: number;
  cost: number;
  costType: 'PER_UNIT' | 'FIXED';
  confidencePct: number;
  isSplittable: boolean;
}

const input = 'rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm w-full';

export default function WorkflowsPage() {
  const { user } = useAuth();
  const writable = user ? canWrite(user.role) : false;
  const [stages, setStages] = useState<Stage[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [processes, setProcesses] = useState<ProcessResource[]>([]);
  const [stageName, setStageName] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [workflowLines, setWorkflowLines] = useState('');
  const [processForm, setProcessForm] = useState({
    name: '',
    stageId: '',
    timeOptimistic: 1,
    timeMostLikely: 2,
    timePessimistic: 3,
    cost: 0,
    costType: 'PER_UNIT' as 'PER_UNIT' | 'FIXED',
    confidencePct: 80,
    isSplittable: false,
    thresholds: '',
  });
  const [msg, setMsg] = useState('');

  const activeStages = useMemo(() => stages.filter((stage) => stage.isActive), [stages]);

  async function load() {
    const [s, w, p] = await Promise.all([
      api<Stage[]>('/stages'),
      api<Workflow[]>('/workflows'),
      api<ProcessResource[]>('/process-resources'),
    ]);
    setStages(s);
    setWorkflows(w);
    setProcesses(p);
    if (!processForm.stageId && s[0]) setProcessForm((prev) => ({ ...prev, stageId: s[0].id }));
  }

  useEffect(() => {
    load().catch((err) => setMsg(err instanceof Error ? err.message : 'فشل التحميل'));
  }, []);

  async function addStage(e: React.FormEvent) {
    e.preventDefault();
    if (!stageName.trim()) return;
    await api('/stages', { method: 'POST', body: JSON.stringify({ name: stageName.trim() }) });
    setStageName('');
    await load();
  }

  async function addWorkflow(e: React.FormEvent) {
    e.preventDefault();
    const byName = new Map(activeStages.map((stage) => [stage.name.trim(), stage.id]));
    const steps = workflowLines
      .split('\n')
      .map((line, sortOrder) => ({
        sortOrder,
        stageIds: line
          .split(',')
          .map((name) => byName.get(name.trim()))
          .filter(Boolean),
      }))
      .filter((step) => step.stageIds.length);
    if (!workflowName.trim() || !steps.length) {
      setMsg('أدخل اسم سير العمل ومراحله، كل سطر خطوة والمراحل المتوازية مفصولة بفاصلة');
      return;
    }
    await api('/workflows', {
      method: 'POST',
      body: JSON.stringify({ name: workflowName.trim(), steps }),
    });
    setWorkflowName('');
    setWorkflowLines('');
    await load();
  }

  async function addProcess(e: React.FormEvent) {
    e.preventDefault();
    const thresholds = processForm.thresholds
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [minQty, addDays] = part.split(':').map(Number);
        return { minQty, addDays };
      })
      .filter((part) => Number.isFinite(part.minQty) && Number.isFinite(part.addDays));

    await api('/process-resources', {
      method: 'POST',
      body: JSON.stringify({ ...processForm, thresholds }),
    });
    setProcessForm((prev) => ({ ...prev, name: '', thresholds: '' }));
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">سير العمل ومكتبة العمليات</h2>
        <p className="text-xs text-zinc-500">عرّف المراحل، ثم ابنِ قوالب سير العمل، ثم اربط الموارد بكل مرحلة.</p>
      </div>
      {msg && <p className="text-xs text-amber-400">{msg}</p>}

      <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 space-y-3">
        <h3 className="text-sm font-medium">مكتبة المراحل</h3>
        {writable && (
          <form onSubmit={addStage} className="flex gap-2">
            <input className={input} value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="مثال: قص، خياطة، طباعة، QC" />
            <button className="px-3 rounded bg-zinc-100 text-zinc-900 text-sm">إضافة</button>
          </form>
        )}
        <div className="flex flex-wrap gap-2">
          {activeStages.map((stage) => (
            <span key={stage.id} className="text-xs px-2 py-1 rounded border border-zinc-700">{stage.name}</span>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 space-y-3">
        <h3 className="text-sm font-medium">قوالب سير العمل</h3>
        {writable && (
          <form onSubmit={addWorkflow} className="grid md:grid-cols-3 gap-2">
            <input className={input} value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} placeholder="اسم القالب" />
            <textarea className={`${input} md:col-span-2`} rows={3} value={workflowLines} onChange={(e) => setWorkflowLines(e.target.value)} placeholder="كل سطر خطوة. افصل المراحل المتوازية بفاصلة:&#10;قماش&#10;قص&#10;خياطة, طباعة&#10;QC" />
            <button className="px-3 py-1.5 rounded bg-zinc-100 text-zinc-900 text-sm md:col-span-3">حفظ قالب سير العمل</button>
          </form>
        )}
        <div className="grid md:grid-cols-2 gap-3">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="rounded-lg border border-zinc-800 p-3 text-xs">
              <p className="font-medium mb-2">{workflow.name}</p>
              <ol className="space-y-1">
                {workflow.steps.map((step) => (
                  <li key={step.sortOrder} className="text-zinc-400">
                    {step.sortOrder + 1}. {step.stages.map((membership) => membership.stage.name).join(' + ')}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 p-4 bg-zinc-900 space-y-3">
        <h3 className="text-sm font-medium">مكتبة الموارد/العمليات</h3>
        {writable && (
          <form onSubmit={addProcess} className="grid md:grid-cols-4 gap-2">
            <input className={input} value={processForm.name} onChange={(e) => setProcessForm({ ...processForm, name: e.target.value })} placeholder="اسم المورد" />
            <select className={input} value={processForm.stageId} onChange={(e) => setProcessForm({ ...processForm, stageId: e.target.value })}>
              {activeStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
            <input className={input} type="number" min={0.1} step={0.1} value={processForm.timeOptimistic} onChange={(e) => setProcessForm({ ...processForm, timeOptimistic: Number(e.target.value) })} placeholder="متفائل" />
            <input className={input} type="number" min={0.1} step={0.1} value={processForm.timeMostLikely} onChange={(e) => setProcessForm({ ...processForm, timeMostLikely: Number(e.target.value) })} placeholder="غالب" />
            <input className={input} type="number" min={0.1} step={0.1} value={processForm.timePessimistic} onChange={(e) => setProcessForm({ ...processForm, timePessimistic: Number(e.target.value) })} placeholder="متشائم" />
            <input className={input} type="number" min={0} step={0.01} value={processForm.cost} onChange={(e) => setProcessForm({ ...processForm, cost: Number(e.target.value) })} placeholder="التكلفة" />
            <select className={input} value={processForm.costType} onChange={(e) => setProcessForm({ ...processForm, costType: e.target.value as 'PER_UNIT' | 'FIXED' })}>
              <option value="PER_UNIT">لكل قطعة</option>
              <option value="FIXED">ثابتة</option>
            </select>
            <input className={input} type="number" min={0} max={100} value={processForm.confidencePct} onChange={(e) => setProcessForm({ ...processForm, confidencePct: Number(e.target.value) })} placeholder="الثقة %" />
            <input className={`${input} md:col-span-2`} value={processForm.thresholds} onChange={(e) => setProcessForm({ ...processForm, thresholds: e.target.value })} placeholder="عتبات الكمية: 500:1,1000:2" />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={processForm.isSplittable} onChange={(e) => setProcessForm({ ...processForm, isSplittable: e.target.checked })} />
              قابل للتقسيم
            </label>
            <button className="px-3 py-1.5 rounded bg-zinc-100 text-zinc-900 text-sm">إضافة مورد</button>
          </form>
        )}
        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full text-xs">
            <thead className="bg-zinc-950 text-zinc-500"><tr><th className="p-2 text-start">المورد</th><th>المرحلة</th><th>الوقت</th><th>التكلفة</th><th>ثقة</th><th>تقسيم</th></tr></thead>
            <tbody>
              {processes.map((process) => (
                <tr key={process.id} className="border-t border-zinc-800">
                  <td className="p-2">{process.name}</td>
                  <td className="p-2 text-center">{process.stage?.name || '-'}</td>
                  <td className="p-2 text-center">{process.timeOptimistic}/{process.timeMostLikely}/{process.timePessimistic}</td>
                  <td className="p-2 text-center">{process.cost} {process.costType === 'PER_UNIT' ? '/ قطعة' : 'ثابت'}</td>
                  <td className="p-2 text-center">{process.confidencePct}%</td>
                  <td className="p-2 text-center">{process.isSplittable ? 'نعم' : 'لا'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
