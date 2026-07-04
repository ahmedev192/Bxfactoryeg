import { describe, it, expect } from 'vitest';
import { OrderStatus } from '@prisma/client';
import { isValidStatusTransition } from '../lib/orderStatus';

describe('isValidStatusTransition', () => {
  it('allows same status (no-op)', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(isValidStatusTransition(status, status)).toBe(true);
    }
  });

  it('allows valid forward transitions from DRAFT', () => {
    expect(isValidStatusTransition(OrderStatus.DRAFT, OrderStatus.PLANNED)).toBe(true);
    expect(isValidStatusTransition(OrderStatus.DRAFT, OrderStatus.ARCHIVED)).toBe(true);
  });

  it('rejects invalid transitions from DRAFT', () => {
    expect(isValidStatusTransition(OrderStatus.DRAFT, OrderStatus.RELEASED)).toBe(false);
    expect(isValidStatusTransition(OrderStatus.DRAFT, OrderStatus.COMPLETED)).toBe(false);
  });

  it('allows PLANNED → RELEASED and rollback to DRAFT', () => {
    expect(isValidStatusTransition(OrderStatus.PLANNED, OrderStatus.RELEASED)).toBe(true);
    expect(isValidStatusTransition(OrderStatus.PLANNED, OrderStatus.DRAFT)).toBe(true);
  });

  it('allows production lifecycle transitions', () => {
    expect(isValidStatusTransition(OrderStatus.RELEASED, OrderStatus.IN_PRODUCTION)).toBe(true);
    expect(isValidStatusTransition(OrderStatus.IN_PRODUCTION, OrderStatus.COMPLETED)).toBe(true);
    expect(isValidStatusTransition(OrderStatus.COMPLETED, OrderStatus.ARCHIVED)).toBe(true);
  });

  it('allows restore from ARCHIVED to DRAFT', () => {
    expect(isValidStatusTransition(OrderStatus.ARCHIVED, OrderStatus.DRAFT)).toBe(true);
  });

  it('rejects skipping steps', () => {
    expect(isValidStatusTransition(OrderStatus.DRAFT, OrderStatus.IN_PRODUCTION)).toBe(false);
    expect(isValidStatusTransition(OrderStatus.PLANNED, OrderStatus.COMPLETED)).toBe(false);
  });
});
