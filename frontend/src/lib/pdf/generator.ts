import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { ar } from './arabic';
import { FieldType } from '@production-ops/shared';

export interface PdfField {
  label: string;
  value: string;
  fieldType: FieldType;
}

export interface GeneratePdfOptions {
  fields: PdfField[];
  colors: string[];
  sizes: string[];
  matrix: Record<string, number>;
  photos: string[];
  orient: 'p' | 'l';
  inclPhotos: boolean;
  orderNo?: string;
  orderId?: string;
  companyName?: string;
}

let fontLoaded = false;
let fontBase64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadArabicFont(doc: jsPDF): Promise<boolean> {
  if (fontLoaded) {
    try {
      doc.setFont('Amiri', 'normal');
      return true;
    } catch {
      fontLoaded = false;
    }
  }
  try {
    if (!fontBase64) {
      const res = await fetch('/fonts/Amiri-Regular.ttf');
      if (!res.ok) throw new Error('Local Arabic font not found');
      fontBase64 = arrayBufferToBase64(await res.arrayBuffer());
    }
    doc.addFileToVFS('Amiri-Regular.ttf', fontBase64);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    doc.setFont('Amiri', 'normal');
    fontLoaded = true;
    return true;
  } catch {
    return false;
  }
}

async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 120, margin: 1 });
}

function setAr(doc: jsPDF, size: number, fontOk: boolean) {
  if (fontOk) doc.setFont('Amiri', 'normal');
  doc.setFontSize(size);
}

function setLat(doc: jsPDF, size: number, style: 'normal' | 'bold' = 'normal') {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
}

export async function generateProductionPdf(opts: GeneratePdfOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: opts.orient, unit: 'mm', format: 'a4', compress: true });
  const fontOk = await loadArabicFont(doc);

  const pw = opts.orient === 'p' ? 210 : 297;
  const ph = opts.orient === 'p' ? 297 : 210;
  const m = 5;
  const cw = pw - m * 2;
  let y = m;

  const orderNo = opts.fields.find((f) => f.label === 'رقم أمر الإنتاج')?.value || opts.orderNo || '';
  const modelType = opts.fields.find((f) => f.label === 'نوع الموديل')?.value || '';
  const factory = opts.fields.find((f) => f.label === 'اسم المصنع')?.value || '';
  const date = opts.fields.find((f) => f.label === 'التاريخ')?.value || new Date().toISOString().split('T')[0];
  const notes = opts.fields.find((f) => f.label === 'تعليمات')?.value || '';
  const headerName = opts.companyName || factory || 'Production Order';

  doc.setFillColor(20, 20, 20);
  doc.rect(m, y, cw, 9, 'F');
  doc.setTextColor(230, 230, 230);
  setAr(doc, 11, fontOk);
  doc.text(ar(headerName), pw - m - 1, y + 6, { align: 'right' });
  setLat(doc, 7);
  const enRef = opts.orderId ? ` | Ref: ${opts.orderId.slice(0, 8)}` : '';
  doc.text(`No: ${orderNo || '-'}   ${date}${enRef}`, m + 1, y + 6);
  doc.setTextColor(0, 0, 0);
  y += 11;

  setAr(doc, 11, fontOk);
  doc.text(ar('أمر إنتاج') + (modelType ? ` - ${ar(modelType)}` : ''), pw / 2, y + 5, { align: 'center' });
  y += 8;
  doc.setLineWidth(0.3);
  doc.line(m, y, pw - m, y);
  y += 2;

  const infoFields = opts.fields.filter((f) => f.label !== 'تعليمات');
  const colW = cw / 2 - 1;
  setAr(doc, 7, fontOk);
  for (let i = 0; i < infoFields.length; i += 2) {
    const pair = infoFields.slice(i, i + 2);
    pair.forEach((f, col) => {
      const x = m + col * (colW + 2);
      const labelAr = ar(f.label) + ':';
      const valAr = f.value ? ar(f.value) : '-';
      doc.text(labelAr, x + colW, y + 3.5, { align: 'right' });
      const labelW = doc.getTextWidth(labelAr);
      doc.text(valAr, x + colW - labelW - 1, y + 3.5, { align: 'right' });
    });
    y += 5;
  }
  doc.line(m, y, pw - m, y);
  y += 2;

  let grand = 0;
  if (opts.colors.length && opts.sizes.length) {
    const cc = opts.sizes.length + 2;
    const colW2 = cw / cc;
    doc.setFillColor(25, 25, 25);
    doc.rect(m, y, cw, 5, 'F');
    doc.setTextColor(255, 255, 255);
    setAr(doc, 6.5, fontOk);
    doc.text(ar('اللون/المقاس'), m + colW2 * 0.5, y + 3.4, { align: 'center' });
    opts.sizes.forEach((s, i) => doc.text(s, m + colW2 * (i + 1) + colW2 * 0.5, y + 3.4, { align: 'center' }));
    doc.text(ar('المجموع'), m + colW2 * (opts.sizes.length + 1) + colW2 * 0.5, y + 3.4, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 5;

    opts.colors.forEach((col, ci) => {
      const bg = ci % 2 === 0 ? [255, 255, 255] : [248, 248, 248];
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.rect(m, y, cw, 4.5, 'F');
      setAr(doc, 6.5, fontOk);
      doc.text(ar(col), m + colW2 * 0.5, y + 3, { align: 'center' });
      let rowT = 0;
      setLat(doc, 6.5);
      opts.sizes.forEach((s, si) => {
        const v = opts.matrix[`${col}|${s}`] || 0;
        rowT += v;
        if (v) doc.text(String(v), m + colW2 * (si + 1) + colW2 * 0.5, y + 3, { align: 'center' });
      });
      grand += rowT;
      setLat(doc, 6.5, 'bold');
      doc.text(String(rowT), m + colW2 * (opts.sizes.length + 1) + colW2 * 0.5, y + 3, { align: 'center' });
      doc.setLineWidth(0.15);
      doc.rect(m, y, cw, 4.5, 'S');
      y += 4.5;
    });

    doc.setFillColor(220, 220, 220);
    doc.rect(m, y, cw, 4.5, 'F');
    setAr(doc, 6.5, fontOk);
    doc.text(ar('الإجمالي'), m + colW2 * 0.5, y + 3, { align: 'center' });
    setLat(doc, 6.5);
    opts.sizes.forEach((s, si) => {
      let ct = 0;
      opts.colors.forEach((c) => {
        ct += opts.matrix[`${c}|${s}`] || 0;
      });
      doc.text(String(ct), m + colW2 * (si + 1) + colW2 * 0.5, y + 3, { align: 'center' });
    });
    doc.setFillColor(25, 25, 25);
    doc.rect(m + colW2 * (opts.sizes.length + 1), y, colW2, 4.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(String(grand), m + colW2 * (opts.sizes.length + 1) + colW2 * 0.5, y + 3, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.rect(m, y, cw, 4.5, 'S');
    y += 7;
  }

  if (opts.inclPhotos && opts.photos.length) {
    if (y > ph - 40) {
      doc.addPage();
      y = m;
    }
    const n = opts.photos.length;
    if (n === 1) {
      const maxH = Math.min(ph - y - 25, 90);
      try {
        doc.addImage(opts.photos[0], 'JPEG', m, y, cw, maxH, undefined, 'MEDIUM');
      } catch {
        /* skip */
      }
      y += maxH + 3;
    } else {
      const cols = n <= 4 ? 2 : 3;
      const rows = Math.ceil(n / cols);
      const imgW = (cw - (cols - 1) * 3) / cols;
      const imgH = Math.min(imgW * 0.7, (ph - y - 25) / rows - 3);
      opts.photos.forEach((p, i) => {
        const c2 = i % cols;
        const r = Math.floor(i / cols);
        try {
          doc.addImage(p, 'JPEG', m + c2 * (imgW + 3), y + r * (imgH + 3), imgW, imgH, undefined, 'MEDIUM');
        } catch {
          /* skip */
        }
      });
      y += rows * (imgH + 3) + 3;
    }
  }

  if (notes) {
    if (y > ph - 30) {
      doc.addPage();
      y = m;
    }
    y += 2;
    doc.line(m, y, pw - m, y);
    y += 2;
    setAr(doc, 7, fontOk);
    doc.text(ar('التعليمات:'), pw - m, y + 3.5, { align: 'right' });
    y += 5;
    const frameH = Math.min(24, ph - y - 8);
    doc.setFillColor(252, 252, 252);
    doc.rect(m, y, cw, frameH, 'F');
    doc.setLineWidth(0.5);
    doc.setDrawColor(180, 180, 180);
    doc.rect(m, y, cw, frameH, 'S');
    doc.setDrawColor(0, 0, 0);
    setAr(doc, 7, fontOk);
    const noteLines = doc.splitTextToSize(ar(notes), cw - 4);
    noteLines.slice(0, Math.floor(frameH / 3.5)).forEach((l: string, li: number) => {
      doc.text(l, pw - m - 2, y + 3.5 + li * 3.5, { align: 'right' });
    });
    y += frameH + 3;
  }

  if (opts.orderId) {
    try {
      const qrUrl = await qrDataUrl(opts.orderId);
      doc.addImage(qrUrl, 'PNG', m, ph - 22, 18, 18);
    } catch {
      setLat(doc, 5);
      doc.text(`QR:${opts.orderId}`, pw - m - 2, ph - 6, { align: 'right' });
    }
  }

  setLat(doc, 5.5);
  doc.setTextColor(150, 150, 150);
  doc.text(`${headerName} | ${date} | Total: ${grand} pcs`, pw / 2, ph - 2, { align: 'center' });

  return doc;
}

export async function downloadProductionPdf(filename: string, opts: GeneratePdfOptions) {
  const doc = await generateProductionPdf(opts);
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export async function pdfToBlob(opts: GeneratePdfOptions): Promise<Blob> {
  const doc = await generateProductionPdf(opts);
  return doc.output('blob');
}
