import { GlobalSettings } from '@prisma/client';

export function parseWorkingDays(settings: GlobalSettings): number[] {
  try {
    const days = JSON.parse(settings.workingDaysJson);
    return Array.isArray(days) ? days : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

export function parseHolidays(settings: GlobalSettings): string[] {
  try {
    const h = JSON.parse(settings.holidaysJson);
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

function isWorkingDay(date: Date, workingDays: number[], holidays: string[]): boolean {
  const iso = date.toISOString().split('T')[0];
  if (holidays.includes(iso)) return false;
  return workingDays.includes(date.getDay());
}

export function addWorkingDays(
  start: Date,
  days: number,
  workingDays: number[],
  holidays: string[],
  buffer = 0
): Date {
  let current = new Date(start);
  let remaining = days + buffer;
  while (remaining > 0) {
    current.setDate(current.getDate() + 1);
    if (isWorkingDay(current, workingDays, holidays)) {
      remaining--;
    }
  }
  return current;
}

export function countWorkingDaysBetween(
  start: Date,
  end: Date,
  workingDays: number[],
  holidays: string[]
): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (isWorkingDay(current, workingDays, holidays)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function daysUntilDeadline(deadline: Date, from: Date = new Date()): number {
  return Math.ceil((deadline.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}
