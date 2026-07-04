import { UserRole } from '@production-ops/shared';

export type AuthUser = { id: string; email: string; name: string; role: UserRole; isActive?: boolean };

export function canWrite(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.PLANNER || role === UserRole.PRODUCTION_MANAGER;
}

export function canPlan(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.PLANNER;
}

export function canExportPdf(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.PLANNER || role === UserRole.PRODUCTION_MANAGER;
}

export function canAdmin(role: UserRole): boolean {
  return role === UserRole.ADMIN;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'مدير',
  [UserRole.PLANNER]: 'مخطط',
  [UserRole.PRODUCTION_MANAGER]: 'مدير إنتاج',
  [UserRole.VIEWER]: 'عارض',
};
