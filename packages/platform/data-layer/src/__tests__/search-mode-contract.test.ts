import { describe, expect, it } from 'vitest';

import {
  SEARCH_MODES,
  SEARCH_MODE_DECLARATIONS,
  searchModeDeclaration,
  searchModesByCorpus,
  type SearchCorpus,
  type SearchMode,
} from '../search/types';
import {
  SearchResidencyError,
  assertSearchResidency,
  searchResidencyDecision,
  type SearchResidencyRefusal,
  type SearchResidencyState,
} from '../search/residency';

const CORPORA: readonly SearchCorpus[] = [
  'workspace_rows',
  'private_index',
  'connector_grant',
  'public_web',
  'multi_step',
];

/** Regions stand in for any pair: what matters is same, different, or unknown. */
const HOME = 'region-a';
const ELSEWHERE = 'region-b';

const IN_REGION: SearchResidencyState = {
  origin: HOME,
  executing: HOME,
  provisioned: true,
  missing: [],
};

const EXCLUSIONS: ReadonlyArray<{
  label: string;
  refusal: SearchResidencyRefusal;
  state: SearchResidencyState;
}> = [
  {
    label: 'the workspace lives in another region',
    refusal: 'cross_region',
    state: { origin: HOME, executing: ELSEWHERE, provisioned: true, missing: [] },
  },
  {
    label: 'the home region has no store',
    refusal: 'region_not_provisioned',
    state: {
      origin: HOME,
      executing: ELSEWHERE,
      provisioned: false,
      missing: ['AGI_DATA_REGION_HOME_DATABASE_URL'],
    },
  },
  {
    label: 'the home region has no store and this deployment is it',
    refusal: 'region_not_provisioned',
    state: { origin: HOME, executing: HOME, provisioned: false, missing: [] },
  },
  {
    label: 'the pin could not be read',
    refusal: 'region_unverified',
    state: { origin: null, executing: HOME, provisioned: true, missing: [] },
  },
  {
    label: 'the pin could not be read and nothing is provisioned',
    refusal: 'region_unverified',
    state: { origin: null, executing: ELSEWHERE, provisioned: false, missing: ['unset'] },
  },
];

function pinnedModes(): SearchMode[] {
  return SEARCH_MODES.filter(
    (mode) => searchModeDeclaration(mode).residency === 'workspace_region',
  );
}

function egressModes(): SearchMode[] {
  return SEARCH_MODES.filter((mode) => searchModeDeclaration(mode).residency === 'external_egress');
}

describe('every declared mode carries a whole contract', () => {
  it('declares each mode once, under its own id, with nothing left unset', () => {
    expect(Object.keys(SEARCH_MODE_DECLARATIONS).sort()).toEqual([...SEARCH_MODES].sort());
    for (const mode of SEARCH_MODES) {
      const declaration = searchModeDeclaration(mode);
      expect(declaration.id).toBe(mode);
      for (const field of [
        'label',
        'consumer',
        'corpus',
        'freshness',
        'citations',
        'authority',
        'latencyBudgetMs',
        'residency',
      ] as const) {
        expect(declaration[field], `${mode}.${field}`).toBeDefined();
      }
      expect(CORPORA, `${mode}.corpus`).toContain(declaration.corpus);
      expect(declaration.latencyBudgetMs).toBeGreaterThan(0);
    }
  });

  it('asks for citations wherever a model reads the result', () => {
    for (const mode of SEARCH_MODES) {
      const declaration = searchModeDeclaration(mode);
      if (declaration.consumer !== 'model') continue;
      expect(declaration.citations, `${mode} feeds a model uncited`).not.toBe('none');
    }
  });

  it('derives residency from the corpus rather than per mode', () => {
    for (const mode of SEARCH_MODES) {
      const declaration = searchModeDeclaration(mode);
      const stayput =
        declaration.corpus === 'workspace_rows' || declaration.corpus === 'private_index';
      expect(declaration.residency, `${mode} over ${declaration.corpus}`).toBe(
        stayput ? 'workspace_region' : 'external_egress',
      );
    }
  });

  it('gives a workspace corpus a workspace authority, never a bare session', () => {
    for (const mode of SEARCH_MODES) {
      const declaration = searchModeDeclaration(mode);
      if (declaration.corpus !== 'private_index') continue;
      expect(declaration.authority, `${mode} reads the private index`).toBe('workspace_member');
    }
  });

  it('accounts for every corpus and every mode exactly once', () => {
    const byCorpus = CORPORA.flatMap((corpus) => [...searchModesByCorpus(corpus)]);
    expect([...byCorpus].sort()).toEqual([...SEARCH_MODES].sort());
  });
});

describe('residency fails closed for every pinned mode', () => {
  it('allows every mode when the workspace is answered from its own provisioned region', () => {
    for (const mode of SEARCH_MODES) {
      expect(searchResidencyDecision(mode, IN_REGION), mode).toEqual({ allowed: true });
    }
  });

  it.each(EXCLUSIONS)('refuses every pinned mode when $label', ({ refusal, state }) => {
    const pinned = pinnedModes();
    expect(pinned.length).toBeGreaterThan(0);
    for (const mode of pinned) {
      const decision = searchResidencyDecision(mode, state);
      expect(decision.allowed, `${mode} was served anyway`).toBe(false);
      if (decision.allowed === false) {
        expect(decision.refusal, mode).toBe(refusal);
        expect(decision.reason.length, mode).toBeGreaterThan(0);
      }
    }
  });

  it.each(EXCLUSIONS)('leaves every egress mode to its own contract when $label', ({ state }) => {
    const egress = egressModes();
    expect(egress.length).toBeGreaterThan(0);
    for (const mode of egress) {
      expect(searchResidencyDecision(mode, state), mode).toEqual({ allowed: true });
    }
  });

  it('throws a typed refusal naming both regions for every pinned mode', () => {
    for (const mode of pinnedModes()) {
      for (const exclusion of EXCLUSIONS) {
        let caught: unknown;
        try {
          assertSearchResidency(mode, exclusion.state);
        } catch (error) {
          caught = error;
        }
        expect(caught, `${mode} / ${exclusion.label}`).toBeInstanceOf(SearchResidencyError);
        const refusal = caught as SearchResidencyError;
        expect(refusal.mode).toBe(mode);
        expect(refusal.refusal).toBe(exclusion.refusal);
        expect(refusal.origin).toBe(exclusion.state.origin);
        expect(refusal.executing).toBe(exclusion.state.executing);
        expect(refusal.missing).toEqual(exclusion.state.missing);
      }
    }
  });

  it('refuses a pinned mode for every executing region that is not the origin', () => {
    const regions = ['region-a', 'region-b', 'region-c', 'region-d'];
    for (const mode of pinnedModes()) {
      for (const origin of regions) {
        for (const executing of regions) {
          const decision = searchResidencyDecision(mode, {
            origin,
            executing,
            provisioned: true,
            missing: [],
          });
          expect(decision.allowed, `${mode} ${origin} -> ${executing}`).toBe(origin === executing);
        }
      }
    }
  });
});
