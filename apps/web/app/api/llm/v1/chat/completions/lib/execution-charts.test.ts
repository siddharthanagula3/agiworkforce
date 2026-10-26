import { describe, expect, it } from 'vitest';

import { executionChartsToPersist } from './execution-charts';

describe('executionChartsToPersist', () => {
  it('keeps a single chart', () => {
    expect(executionChartsToPersist(['one'])).toEqual(['one']);
  });

  it('keeps one copy when the same figure is emitted twice', () => {
    expect(executionChartsToPersist(['same', 'same'])).toEqual(['same']);
  });

  it('keeps only the last figure when a run emits a clipped chart and then the finished one', () => {
    expect(executionChartsToPersist(['clipped', 'finished'])).toEqual(['finished']);
  });
});
