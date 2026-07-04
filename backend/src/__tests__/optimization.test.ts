import { describe, it, expect } from 'vitest';
import { computeParetoFrontier } from '../services/optimization';
import { ScenarioType } from '@prisma/client';

describe('computeParetoFrontier', () => {
  it('marks all mutually non-dominated scenarios on frontier', () => {
    const scenarios = [
      { id: 'a', type: ScenarioType.FASTEST_TIME, totalDays: 10, totalCost: 100, certaintyPct: 80, label: 'A' },
      { id: 'b', type: ScenarioType.LOWEST_COST, totalDays: 15, totalCost: 50, certaintyPct: 70, label: 'B' },
    ];
    const frontier = computeParetoFrontier(scenarios);
    const onFrontier = frontier.filter((p) => p.isOnFrontier);
    expect(onFrontier).toHaveLength(2);
  });

  it('excludes dominated scenario from frontier', () => {
    const scenarios = [
      { id: 'fast', type: ScenarioType.FASTEST_TIME, totalDays: 5, totalCost: 100, certaintyPct: 90, label: 'Fast' },
      { id: 'slow', type: ScenarioType.LOWEST_COST, totalDays: 10, totalCost: 150, certaintyPct: 80, label: 'Slow' },
    ];
    const frontier = computeParetoFrontier(scenarios);
    const slow = frontier.find((p) => p.scenarioId === 'slow');
    expect(slow?.isOnFrontier).toBe(false);
    const fast = frontier.find((p) => p.scenarioId === 'fast');
    expect(fast?.isOnFrontier).toBe(true);
  });
});
