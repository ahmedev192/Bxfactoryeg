import { OrderStatus } from '@prisma/client';

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: [OrderStatus.PLANNED, OrderStatus.ARCHIVED],
  PLANNED: [OrderStatus.DRAFT, OrderStatus.RELEASED, OrderStatus.ARCHIVED],
  RELEASED: [OrderStatus.IN_PRODUCTION, OrderStatus.ARCHIVED],
  IN_PRODUCTION: [OrderStatus.COMPLETED, OrderStatus.ARCHIVED],
  COMPLETED: [OrderStatus.ARCHIVED],
  ARCHIVED: [OrderStatus.DRAFT],
};

export function isValidStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}
