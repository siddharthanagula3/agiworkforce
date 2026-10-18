import { describe, expect, it } from 'vitest';

import { readReportingWindow } from './reporting-window';

const NOW = new Date('2026-10-18T12:00:00.000Z');

describe('readReportingWindow', () => {
  it('defaults to the thirty days ending now', () => {
    const { from, to } = readReportingWindow(new URLSearchParams(), NOW);
    expect(to).toEqual(NOW);
    expect(from).toEqual(new Date('2026-09-18T12:00:00.000Z'));
  });

  it('measures the default start from an explicit end', () => {
    const { from, to } = readReportingWindow(
      new URLSearchParams({ to: '2026-06-30T00:00:00.000Z' }),
      NOW,
    );
    expect(to).toEqual(new Date('2026-06-30T00:00:00.000Z'));
    expect(from).toEqual(new Date('2026-05-31T00:00:00.000Z'));
  });

  it('takes both bounds when given', () => {
    const { from, to } = readReportingWindow(
      new URLSearchParams({ from: '2026-01-01', to: '2026-02-01' }),
      NOW,
    );
    expect(from).toEqual(new Date('2026-01-01'));
    expect(to).toEqual(new Date('2026-02-01'));
  });

  it('falls back to the defaults for a value that is not a date', () => {
    const { from, to } = readReportingWindow(
      new URLSearchParams({ from: 'yesterday', to: 'soon' }),
      NOW,
    );
    expect(to).toEqual(NOW);
    expect(from).toEqual(new Date('2026-09-18T12:00:00.000Z'));
  });
});
