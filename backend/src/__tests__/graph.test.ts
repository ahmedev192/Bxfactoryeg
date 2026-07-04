import { describe, expect, it } from 'vitest';
import { ScenarioType, StepType } from '@prisma/client';
import { scenarioToGraph } from '../services/optimization';

describe('scenarioToGraph', () => {
  it('connects parallel steps from the same predecessor and converges to the next step', () => {
    const graph = scenarioToGraph({
      type: ScenarioType.BALANCED,
      vendorSummary: '',
      steps: [
        { id: 'cut', stepOrder: 1, stepType: StepType.GENERIC, stageName: 'Cut', vendorName: 'Cut A', days: 2, cost: 10, splits: [] },
        { id: 'sew', stepOrder: 2, stepType: StepType.GENERIC, stageName: 'Sew', vendorName: 'Sew A', days: 4, cost: 20, splits: [] },
        { id: 'print', stepOrder: 2, stepType: StepType.GENERIC, stageName: 'Print', vendorName: 'Print A', days: 3, cost: 15, splits: [] },
        { id: 'qc', stepOrder: 3, stepType: StepType.GENERIC, stageName: 'QC', vendorName: 'QC A', days: 1, cost: 5, splits: [] },
      ],
    });

    expect(graph.edges).toContainEqual({ id: 'e-cut-sew', source: 'step-cut', target: 'step-sew' });
    expect(graph.edges).toContainEqual({ id: 'e-cut-print', source: 'step-cut', target: 'step-print' });
    expect(graph.edges).toContainEqual({ id: 'e-sew-qc', source: 'step-sew', target: 'step-qc' });
    expect(graph.edges).toContainEqual({ id: 'e-print-qc', source: 'step-print', target: 'step-qc' });
  });
});
