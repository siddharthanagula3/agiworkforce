import { describe, expect, it, vi } from 'vitest';
import { DOWNLOAD_PROGRESS_STEP, reportProgressBySteps } from '../progress';

describe('reportProgressBySteps', () => {
  it('passes on one update per percent of a download that reports every chunk', () => {
    const shown: number[] = [];
    const report = reportProgressBySteps((fraction) => shown.push(fraction));
    const chunks = 20_000;

    for (let chunk = 1; chunk <= chunks; chunk += 1) report(chunk / chunks);

    expect(DOWNLOAD_PROGRESS_STEP).toBe(0.01);
    expect(shown.length).toBeLessThanOrEqual(101);
    expect(shown[shown.length - 1]).toBe(1);
    expect(shown.every((fraction, index) => index === 0 || fraction > shown[index - 1]!)).toBe(
      true,
    );
  });

  it('reports completion once and ignores values that are not numbers', () => {
    const onProgress = vi.fn();
    const report = reportProgressBySteps(onProgress);

    report(Number.NaN);
    report(1);
    report(1);

    expect(onProgress.mock.calls).toEqual([[1]]);
  });
});
