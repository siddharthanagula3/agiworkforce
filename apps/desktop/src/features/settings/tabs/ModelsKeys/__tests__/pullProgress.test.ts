import { describe, expect, it } from 'vitest';

import { describePullProgress } from '../index';

const GIB = 1024 * 1024 * 1024;

function progress(status: string, total: number | null = null, completed: number | null = null) {
  return { model: 'fixture-model', status, digest: total ? 'abc' : null, total, completed };
}

describe('describePullProgress', () => {
  it('has a starting state before Ollama reports anything', () => {
    expect(describePullProgress(null)).toEqual({ label: 'Starting download', percent: null });
  });

  it('reports the bytes of the layer in flight', () => {
    expect(describePullProgress(progress('pulling abc', 4 * GIB, GIB))).toEqual({
      label: 'Downloading 1.00 GB of 4.00 GB',
      percent: 25,
    });
  });

  it('treats a layer with no completed count yet as not started', () => {
    expect(describePullProgress(progress('pulling abc', 4 * GIB))).toEqual({
      label: 'Downloading 0 B of 4.00 GB',
      percent: 0,
    });
  });

  it('never reports more than the whole layer', () => {
    expect(describePullProgress(progress('pulling abc', GIB, 2 * GIB)).percent).toBe(100);
  });

  it('names the steps that move no bytes without inventing a percentage', () => {
    expect(describePullProgress(progress('pulling manifest'))).toEqual({
      label: 'Pulling manifest',
      percent: null,
    });
    expect(describePullProgress(progress('verifying sha256 digest'))).toEqual({
      label: 'Verifying sha256 digest',
      percent: null,
    });
  });
});
