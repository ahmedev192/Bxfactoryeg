import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { toNumber } from '../lib/utils';
import { SCENARIO_LABELS } from '@production-ops/shared';

type DbClient = typeof prisma | Prisma.TransactionClient;

export async function exportMasterDataWorkbook(): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const addSheet = async (
    name: string,
    headers: string[],
    rows: Array<Array<string | number>>
  ) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(headers);
    rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
  };

  const factories = await prisma.factory.findMany();
  await addSheet(
    'Factories',
    ['name', 'processingDays', 'costPerUnit', 'fixedCost', 'confidencePct', 'isActive', 'isSplittable', 'minSplitPct', 'maxSplits', 'categories', 'capacityPerDay', 'notes'],
    factories.map((f) => [
      f.name,
      toNumber(f.processingDays),
      toNumber(f.costPerUnit),
      toNumber(f.fixedCost),
      toNumber(f.confidencePct),
      f.isActive ? 1 : 0,
      f.isSplittable ? 1 : 0,
      toNumber(f.minSplitPct),
      f.maxSplits,
      f.categories || '',
      f.capacityPerDay || 0,
      f.notes || '',
    ])
  );

  const prints = await prisma.printingPlace.findMany();
  await addSheet(
    'PrintingPlaces',
    ['name', 'processingDays', 'costPerUnit', 'fixedCost', 'confidencePct', 'isActive', 'isSplittable', 'minSplitPct', 'maxSplits', 'printTypes', 'notes'],
    prints.map((p) => [
      p.name,
      toNumber(p.processingDays),
      toNumber(p.costPerUnit),
      toNumber(p.fixedCost),
      toNumber(p.confidencePct),
      p.isActive ? 1 : 0,
      p.isSplittable ? 1 : 0,
      toNumber(p.minSplitPct),
      p.maxSplits,
      p.printTypes || '',
      p.notes || '',
    ])
  );

  const fabrics = await prisma.fabricSupplier.findMany();
  await addSheet(
    'FabricSuppliers',
    ['name', 'processingDays', 'costPerUnit', 'fixedCost', 'confidencePct', 'isActive', 'isSplittable', 'minSplitPct', 'maxSplits', 'moq', 'notes'],
    fabrics.map((f) => [
      f.name,
      toNumber(f.processingDays),
      toNumber(f.costPerUnit),
      toNumber(f.fixedCost),
      toNumber(f.confidencePct),
      f.isActive ? 1 : 0,
      f.isSplittable ? 1 : 0,
      toNumber(f.minSplitPct),
      f.maxSplits,
      f.moq || 0,
      f.notes || '',
    ])
  );

  return wb.xlsx.writeBuffer();
}

export async function exportMasterDataTemplate(): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const addHeaderSheet = (name: string, headers: string[]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
  };

  addHeaderSheet(
    'Factories',
    ['name', 'processingDays', 'costPerUnit', 'fixedCost', 'confidencePct', 'isActive', 'isSplittable', 'minSplitPct', 'maxSplits', 'categories', 'capacityPerDay', 'notes']
  );
  addHeaderSheet(
    'PrintingPlaces',
    ['name', 'processingDays', 'costPerUnit', 'fixedCost', 'confidencePct', 'isActive', 'isSplittable', 'minSplitPct', 'maxSplits', 'printTypes', 'notes']
  );
  addHeaderSheet(
    'FabricSuppliers',
    ['name', 'processingDays', 'costPerUnit', 'fixedCost', 'confidencePct', 'isActive', 'isSplittable', 'minSplitPct', 'maxSplits', 'moq', 'notes']
  );

  return wb.xlsx.writeBuffer();
}

export async function exportPlanningResults(planningRunId: string): Promise<ExcelJS.Buffer> {
  const run = await prisma.planningRun.findUnique({
    where: { id: planningRunId },
    include: {
      scenarios: {
        include: { steps: { include: { splits: true }, orderBy: { stepOrder: 'asc' } } },
      },
      order: true,
    },
  });
  if (!run) throw new Error('تشغيل التخطيط غير موجود');

  const wb = new ExcelJS.Workbook();

  const brief = wb.addWorksheet('Order Brief');
  brief.addRows([
    ['Order No', run.order.orderNo],
    ['Quantity', run.quantity],
    ['Deadline', run.deadline.toISOString().split('T')[0]],
    ['Workflow', run.workflowId || 'Legacy fabric-print-factory'],
    ['Generated At', new Date().toISOString()],
    ['Brand / Customer', ''],
    ['Notes', run.order.notes || ''],
  ]);
  brief.getColumn(1).font = { bold: true };

  const cmp = wb.addWorksheet('Scenarios');
  cmp.addRow([
    'Recommended',
    'Scenario',
    'TotalDays',
    'TotalCost',
    'CertaintyPct',
    'P5Days',
    'P50Days',
    'P90Days',
    'P95Days',
    'OnTimePct',
    'MeetsDeadline',
    'SplitCount',
    'VendorSummary',
  ]);
  run.scenarios.forEach((s) => {
    cmp.addRow([
      s.isRecommended ? 'YES' : '',
      SCENARIO_LABELS[s.type] || s.type,
      s.totalDays,
      toNumber(s.totalCost),
      toNumber(s.certaintyPct),
      s.p5Days || '',
      s.p50Days,
      s.p90Days,
      s.p95Days || '',
      s.onTimePct != null ? toNumber(s.onTimePct) : '',
      s.meetsDeadline ? 'Y' : 'N',
      s.splitCount,
      s.vendorSummary,
    ]);
  });
  cmp.getRow(1).font = { bold: true };

  const detail = wb.addWorksheet('RouteDetails');
  detail.addRow(['Scenario', 'Step', 'Stage', 'Type', 'Vendor', 'Days', 'Cost', 'Start', 'End', 'P95End', 'Critical']);
  run.scenarios.forEach((s) => {
    s.steps.forEach((step) => {
      detail.addRow([
        SCENARIO_LABELS[s.type],
        step.stepOrder,
        step.stageName || step.stepType,
        step.stepType,
        step.vendorName,
        step.days,
        toNumber(step.cost),
        step.startDate.toISOString().split('T')[0],
        step.endDate.toISOString().split('T')[0],
        step.p95EndDate ? step.p95EndDate.toISOString().split('T')[0] : '',
        step.isCritical ? 'Y' : '',
      ]);
    });
  });
  detail.getRow(1).font = { bold: true };

  const master = wb.addWorksheet('MasterSnapshot');
  master.addRow(['OrderNo', run.order.orderNo, 'Quantity', run.quantity, 'Deadline', run.deadline.toISOString().split('T')[0]]);

  run.scenarios.forEach((s, idx) => {
    const sheetName = `Action Plan ${idx + 1}`.slice(0, 31);
    const ws = wb.addWorksheet(sheetName);
    ws.addRow([`${s.isRecommended ? 'Recommended - ' : ''}${SCENARIO_LABELS[s.type] || s.type}`]);
    ws.addRow(['Step', 'Stage', 'Vendor', 'Start', 'Deadline P95', 'Planned Days', 'Cost', 'Done?', 'Actual completion date', 'Notes']);
    s.steps.forEach((step) => {
      ws.addRow([
        step.stepOrder,
        step.stageName || step.stepType,
        step.vendorName,
        step.startDate.toISOString().split('T')[0],
        (step.p95EndDate || step.endDate).toISOString().split('T')[0],
        step.days,
        toNumber(step.cost),
        '',
        '',
        '',
      ]);
    });
    ws.getRow(1).font = { bold: true };
    ws.getRow(2).font = { bold: true };
    ws.getColumn(8).width = 12;
    ws.getColumn(9).width = 22;
    ws.getColumn(10).width = 28;
  });

  return wb.xlsx.writeBuffer();
}

function cellVal(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value;
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: string }).text);
  return String(v).trim();
}

function cellNum(row: ExcelJS.Row, col: number, fallback = 0): number {
  const n = Number(cellVal(row, col));
  return Number.isFinite(n) ? n : fallback;
}

async function upsertFactoryByName(
  db: DbClient,
  name: string,
  data: Omit<Parameters<typeof prisma.factory.create>[0]['data'], 'name'>
) {
  const existing = await db.factory.findFirst({ where: { name } });
  if (existing) {
    await db.factory.update({ where: { id: existing.id }, data });
    return 'updated';
  }
  await db.factory.create({ data: { name, ...data } });
  return 'created';
}

async function upsertPrintByName(
  db: DbClient,
  name: string,
  data: Omit<Parameters<typeof prisma.printingPlace.create>[0]['data'], 'name'>
) {
  const existing = await db.printingPlace.findFirst({ where: { name } });
  if (existing) {
    await db.printingPlace.update({ where: { id: existing.id }, data });
    return 'updated';
  }
  await db.printingPlace.create({ data: { name, ...data } });
  return 'created';
}

async function upsertFabricByName(
  db: DbClient,
  name: string,
  data: Omit<Parameters<typeof prisma.fabricSupplier.create>[0]['data'], 'name'>
) {
  const existing = await db.fabricSupplier.findFirst({ where: { name } });
  if (existing) {
    await db.fabricSupplier.update({ where: { id: existing.id }, data });
    return 'updated';
  }
  await db.fabricSupplier.create({ data: { name, ...data } });
  return 'created';
}

export async function importMasterDataFromBuffer(
  buffer: ExcelJS.Buffer
): Promise<{ imported: number; updated: number; errors: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  await prisma.$transaction(async (tx) => {
    const factories = wb.getWorksheet('Factories');
    if (factories) {
      for (let rowNumber = 2; rowNumber <= factories.rowCount; rowNumber++) {
        const row = factories.getRow(rowNumber);
        const name = cellVal(row, 1);
        if (!name) continue;
        try {
          const result = await upsertFactoryByName(tx, name, {
            processingDays: cellNum(row, 2, 1),
            costPerUnit: cellNum(row, 3),
            fixedCost: cellNum(row, 4),
            confidencePct: cellNum(row, 5, 80),
            isActive: cellNum(row, 6) !== 0,
            isSplittable: cellNum(row, 7) === 1,
            minSplitPct: cellNum(row, 8, 10),
            maxSplits: cellNum(row, 9, 2) || 2,
            categories: cellVal(row, 10) || null,
            capacityPerDay: cellNum(row, 11) || null,
            notes: cellVal(row, 12) || null,
          });
          if (result === 'created') imported++;
          else updated++;
        } catch (e) {
          errors.push(`Factories row ${rowNumber}: ${e instanceof Error ? e.message : 'error'}`);
        }
      }
    }

    const prints = wb.getWorksheet('PrintingPlaces');
    if (prints) {
      for (let rowNumber = 2; rowNumber <= prints.rowCount; rowNumber++) {
        const row = prints.getRow(rowNumber);
        const name = cellVal(row, 1);
        if (!name) continue;
        try {
          const result = await upsertPrintByName(tx, name, {
            processingDays: cellNum(row, 2, 1),
            costPerUnit: cellNum(row, 3),
            fixedCost: cellNum(row, 4),
            confidencePct: cellNum(row, 5, 80),
            isActive: cellNum(row, 6) !== 0,
            isSplittable: cellNum(row, 7) === 1,
            minSplitPct: cellNum(row, 8, 10),
            maxSplits: cellNum(row, 9, 2) || 2,
            printTypes: cellVal(row, 10) || null,
            notes: cellVal(row, 11) || null,
          });
          if (result === 'created') imported++;
          else updated++;
        } catch (e) {
          errors.push(`PrintingPlaces row ${rowNumber}: ${e instanceof Error ? e.message : 'error'}`);
        }
      }
    }

    const fabrics = wb.getWorksheet('FabricSuppliers');
    if (fabrics) {
      for (let rowNumber = 2; rowNumber <= fabrics.rowCount; rowNumber++) {
        const row = fabrics.getRow(rowNumber);
        const name = cellVal(row, 1);
        if (!name) continue;
        try {
          const result = await upsertFabricByName(tx, name, {
            processingDays: cellNum(row, 2, 1),
            costPerUnit: cellNum(row, 3),
            fixedCost: cellNum(row, 4),
            confidencePct: cellNum(row, 5, 80),
            isActive: cellNum(row, 6) !== 0,
            isSplittable: cellNum(row, 7) === 1,
            minSplitPct: cellNum(row, 8, 10),
            maxSplits: cellNum(row, 9, 2) || 2,
            moq: cellNum(row, 10) || null,
            notes: cellVal(row, 11) || null,
          });
          if (result === 'created') imported++;
          else updated++;
        } catch (e) {
          errors.push(`FabricSuppliers row ${rowNumber}: ${e instanceof Error ? e.message : 'error'}`);
        }
      }
    }
  });

  return { imported, updated, errors };
}
