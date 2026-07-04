import { describe, expect, it } from 'vitest';
import { vendorPatchSchema, planningRunSchema, processResourceSchema } from '../lib/schemas';

describe('production validation schemas', () => {
  it('rejects empty vendor patches so omitted fields are not defaulted', () => {
    expect(vendorPatchSchema.safeParse({}).success).toBe(false);
  });

  it('requires custom planning weights to have a positive total', () => {
    const result = planningRunSchema.safeParse({
      customWeights: { time: 0, cost: 0, certainty: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts process resources with quantity thresholds', () => {
    const result = processResourceSchema.safeParse({
      name: 'Sewing Line A',
      stageId: 'stage-1',
      timeOptimistic: 2,
      timeMostLikely: 3,
      timePessimistic: 5,
      cost: 12,
      confidencePct: 85,
      thresholds: [{ minQty: 1000, addDays: 1 }],
    });
    expect(result.success).toBe(true);
  });
});
