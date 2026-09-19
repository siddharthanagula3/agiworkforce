import { describe, expect, it } from 'vitest';

import {
  SearchResidencyError,
  assertSearchResidency,
  searchResidencyDecision,
} from '../search/residency';

const IN_REGION = { origin: 'us', executing: 'us', provisioned: true, missing: [] };

describe('searchResidencyDecision', () => {
  it('allows a workspace served from its own provisioned region', () => {
    expect(searchResidencyDecision('private_knowledge', IN_REGION)).toEqual({ allowed: true });
  });

  it('refuses rather than falling through to the region that happens to answer', () => {
    const decision = searchResidencyDecision('private_knowledge', {
      origin: 'eu',
      executing: 'us',
      provisioned: true,
      missing: [],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.refusal).toBe('cross_region');
  });

  it('refuses a pin whose region is declared but not provisioned', () => {
    const decision = searchResidencyDecision('enterprise', {
      origin: 'eu',
      executing: 'us',
      provisioned: false,
      missing: ['AGI_DATA_REGION_EU_DATABASE_URL'],
    });
    expect(decision.allowed === false && decision.refusal).toBe('region_not_provisioned');
  });

  it('refuses when the pin could not be read at all', () => {
    const decision = searchResidencyDecision('project', {
      origin: null,
      executing: 'us',
      provisioned: false,
      missing: [],
    });
    expect(decision.allowed === false && decision.refusal).toBe('region_unverified');
  });

  it('leaves modes that leave the region by design to their own contract', () => {
    for (const mode of ['web', 'research', 'connector'] as const) {
      expect(searchResidencyDecision(mode, { ...IN_REGION, origin: 'eu' })).toEqual({
        allowed: true,
      });
    }
  });
});

describe('assertSearchResidency', () => {
  it('throws a refusal that carries both regions and what was missing', () => {
    try {
      assertSearchResidency('code', {
        origin: 'eu',
        executing: 'us',
        provisioned: false,
        missing: ['AGI_DATA_REGION_EU_DATABASE_URL'],
      });
      expect.unreachable('residency refusal expected');
    } catch (error) {
      expect(error).toBeInstanceOf(SearchResidencyError);
      const refusal = error as SearchResidencyError;
      expect(refusal.mode).toBe('code');
      expect(refusal.origin).toBe('eu');
      expect(refusal.executing).toBe('us');
      expect(refusal.missing).toEqual(['AGI_DATA_REGION_EU_DATABASE_URL']);
    }
  });

  it('returns quietly for a query inside its own region', () => {
    expect(() => assertSearchResidency('product', IN_REGION)).not.toThrow();
  });
});
