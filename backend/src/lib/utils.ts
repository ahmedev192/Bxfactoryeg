import path from 'path';
import fs from 'fs';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

export function ensureUploadDirs() {
  const dirs = ['photos', 'pdfs'];
  for (const d of dirs) {
    const p = path.join(UPLOAD_DIR, d);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
}

export function assertUploadDirsWritable() {
  ensureUploadDirs();
  const dirs = ['photos', 'pdfs'];
  for (const d of dirs) {
    const p = path.join(UPLOAD_DIR, d);
    fs.accessSync(p, fs.constants.W_OK);
  }
}

export function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val);
  if (val && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return Number(val);
}

export function parseJsonArray<T>(json: string, fallback: T[] = []): T[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
