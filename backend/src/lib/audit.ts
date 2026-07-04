import { UserRole } from '@prisma/client';
import { prisma } from './prisma';

export async function logAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: string
) {
  await prisma.auditLog.create({
    data: { userId, action, entityType, entityId, details },
  });
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 4,
  PLANNER: 3,
  PRODUCTION_MANAGER: 2,
  VIEWER: 1,
};

export function canWrite(role: UserRole): boolean {
  return (
    role === UserRole.ADMIN ||
    role === UserRole.PLANNER ||
    role === UserRole.PRODUCTION_MANAGER
  );
}

export function canPlan(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.PLANNER;
}

export function canManageUsers(role: UserRole): boolean {
  return role === UserRole.ADMIN;
}

export function canExportPdf(role: UserRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.PRODUCTION_MANAGER;
}

export function canView(role: UserRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY.VIEWER;
}
