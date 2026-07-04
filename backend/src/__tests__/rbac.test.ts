import { describe, it, expect } from 'vitest';
import { UserRole } from '@prisma/client';
import { canWrite, canPlan, canExportPdf } from '../lib/audit';

describe('RBAC helpers', () => {
  describe('canWrite', () => {
    it('allows ADMIN, PLANNER, and PRODUCTION_MANAGER', () => {
      expect(canWrite(UserRole.ADMIN)).toBe(true);
      expect(canWrite(UserRole.PLANNER)).toBe(true);
      expect(canWrite(UserRole.PRODUCTION_MANAGER)).toBe(true);
    });

    it('denies VIEWER', () => {
      expect(canWrite(UserRole.VIEWER)).toBe(false);
    });
  });

  describe('canPlan', () => {
    it('allows ADMIN and PLANNER only', () => {
      expect(canPlan(UserRole.ADMIN)).toBe(true);
      expect(canPlan(UserRole.PLANNER)).toBe(true);
    });

    it('denies PRODUCTION_MANAGER and VIEWER', () => {
      expect(canPlan(UserRole.PRODUCTION_MANAGER)).toBe(false);
      expect(canPlan(UserRole.VIEWER)).toBe(false);
    });
  });

  describe('canExportPdf', () => {
    it('allows ADMIN, PLANNER, and PRODUCTION_MANAGER', () => {
      expect(canExportPdf(UserRole.ADMIN)).toBe(true);
      expect(canExportPdf(UserRole.PLANNER)).toBe(true);
      expect(canExportPdf(UserRole.PRODUCTION_MANAGER)).toBe(true);
    });

    it('denies VIEWER', () => {
      expect(canExportPdf(UserRole.VIEWER)).toBe(false);
    });
  });
});
