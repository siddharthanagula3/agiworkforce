import { describe, expect, it } from 'vitest';

import { selectCheapestRequestFallback } from './request-cost-fallback';

describe('selectCheapestRequestFallback', () => {
  it('uses request-specific long-context cost instead of catalog base order', () => {
    const baseCheapLongExpensive = {
      model: 'fixture-base-cheap-long-expensive',
      provider: 'fixture-a',
    };
    const baseExpensiveLongCheap = {
      model: 'fixture-base-expensive-long-cheap',
      provider: 'fixture-b',
    };
    const candidates = [baseCheapLongExpensive, baseExpensiveLongCheap];
    const requestCosts = new Map([
      [baseCheapLongExpensive.model, 90],
      [baseExpensiveLongCheap.model, 40],
    ]);

    expect(
      selectCheapestRequestFallback({
        currentModelIds: new Set(['fixture-current']),
        currentRequestCostCents: 100,
        candidates,
        estimateRequestCostCents: (candidate) => requestCosts.get(candidate.model)!,
      }),
    ).toEqual(baseExpensiveLongCheap);
  });

  it('returns null when no distinct candidate is actually cheaper', () => {
    expect(
      selectCheapestRequestFallback({
        currentModelIds: new Set(['fixture-current']),
        currentRequestCostCents: 10,
        candidates: [
          { model: 'fixture-current', provider: 'fixture-a' },
          { model: 'fixture-costlier', provider: 'fixture-b' },
        ],
        estimateRequestCostCents: () => 10,
      }),
    ).toBeNull();
  });
});
