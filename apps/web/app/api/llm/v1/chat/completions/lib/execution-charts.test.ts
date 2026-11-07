import { describe, expect, it } from 'vitest';

import { executionChartsToPersist } from './execution-charts';

describe('executionChartsToPersist', () => {
  it('keeps a single chart', () => {
    expect(executionChartsToPersist(['one'])).toEqual(['one']);
  });

  it('keeps one copy when the same figure is emitted twice', () => {
    expect(executionChartsToPersist(['same', 'same'])).toEqual(['same']);
  });

  it('preserves different figures from one execution in their output order', () => {
    expect(executionChartsToPersist(['bar-figure', 'line-figure', 'bar-figure'])).toEqual([
      'bar-figure',
      'line-figure',
    ]);
  });

  it('does not treat empty render results as charts', () => {
    expect(executionChartsToPersist(['', 'bar-figure', ''])).toEqual(['bar-figure']);
  });
});
