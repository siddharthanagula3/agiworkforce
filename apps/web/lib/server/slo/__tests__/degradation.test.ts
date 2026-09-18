import { describe, expect, it } from 'vitest';

import { SLO_CATALOGUE } from '../catalogue';
import { CAPABILITY_DEGRADATION, degradationFor } from '../degradation';

describe('capability degradation policy', () => {
  it('gives Work, Research and Code a defined degraded mode', () => {
    for (const id of ['work', 'research', 'code']) {
      const policy = degradationFor(id);
      expect(policy, `${id} has no degraded mode`).toBeDefined();
      expect(policy?.behaviour.length).toBeGreaterThan(0);
      expect(policy?.message.length).toBeGreaterThan(0);
    }
  });

  it('covers every published capability, so none degrades by accident', () => {
    const covered = new Set(CAPABILITY_DEGRADATION.map((entry) => entry.id));
    const uncovered = SLO_CATALOGUE.filter(
      (slo) => slo.kind === 'availability' && slo.audience !== 'internal' && !covered.has(slo.id),
    ).map((slo) => slo.id);
    expect(uncovered).toEqual([]);
  });

  it('holds queued work and refuses work it cannot hold', () => {
    expect(degradationFor('work')?.mode).toBe('queued');
    expect(degradationFor('work')?.preservesWork).toBe(true);
    expect(degradationFor('browser')?.mode).toBe('refused');
    expect(degradationFor('browser')?.preservesWork).toBe(false);
  });

  it('never claims a result it did not produce', () => {
    expect(degradationFor('code')?.behaviour).toContain('not run');
    expect(degradationFor('search')?.message).toContain('not based on live results');
  });

  it('keeps existing entitlements working when payments are down', () => {
    const billing = degradationFor('billing-events');
    expect(billing?.mode).toBe('read_only');
    expect(billing?.preservesWork).toBe(true);
  });

  it('names one capability once', () => {
    const ids = CAPABILITY_DEGRADATION.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
