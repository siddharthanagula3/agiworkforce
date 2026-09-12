import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  canAccessModelForSubscriptionTier,
  listCanonicalModels,
  listManagedRoutesForModel,
} from '@agiworkforce/types';

import {
  EVENT_DISABLED_MODELS_ENV,
  EVENT_DISABLED_PROVIDERS_ENV,
  EVENT_ENABLED_ENV,
  EVENT_ENDS_AT_ENV,
  EVENT_MODELS_ENV,
  EVENT_STARTS_AT_ENV,
  eventAllowsModel,
  eventModelIdsFor,
  readEventPromotion,
} from '@/lib/server/event-access';

const ENV_KEYS = [
  EVENT_ENABLED_ENV,
  EVENT_MODELS_ENV,
  EVENT_DISABLED_MODELS_ENV,
  EVENT_DISABLED_PROVIDERS_ENV,
  EVENT_STARTS_AT_ENV,
  EVENT_ENDS_AT_ENV,
];

/**
 * Fixtures are derived, never named. A concrete model id in a test is a second
 * copy of the catalogue: it goes stale on the next curation edit, and the guard
 * that forbids one exists for that reason. `PROMOTED` and `PROMOTED_OTHER` are
 * simply two models a free account cannot reach, which is the only property
 * every case here needs; `UNPROMOTED` is a third that the promotion never names.
 */
const NOT_FREE = listCanonicalModels()
  .map((model) => model.id)
  .filter(
    (id) =>
      !canAccessModelForSubscriptionTier(id, 'free') && listManagedRoutesForModel(id).length > 0,
  )
  .sort();

function providersOf(id: string): Set<string> {
  return new Set(listManagedRoutesForModel(id).map((route) => route.provider));
}

function disjoint(left: Set<string>, right: Set<string>): boolean {
  return [...right].every((provider) => !left.has(provider));
}

// The per-provider switch needs two models that no single provider serves both
// of, so the pair is chosen for that property rather than taken off the front.
const [PROMOTED, PROMOTED_OTHER] = (() => {
  for (const first of NOT_FREE) {
    const firstProviders = providersOf(first);
    const second = NOT_FREE.find((id) => id !== first && disjoint(firstProviders, providersOf(id)));
    if (second) return [first, second] as const;
  }
  throw new Error('no two promotable models with disjoint providers in the registry');
})();

const UNPROMOTED = NOT_FREE.find((id) => id !== PROMOTED && id !== PROMOTED_OTHER)!;
const UNKNOWN_ID = 'not-a-model-in-any-registry';

const PAID_TIERS = ['basic', 'pro', 'max', 'max_15x', 'team', 'enterprise'] as const;

function setEvent(values: Partial<Record<string, string>>) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

describe('event access overlay', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it('is inactive when the flag is off, whatever else is configured', () => {
    setEvent({ [EVENT_MODELS_ENV]: `${UNPROMOTED},${PROMOTED}` });

    expect(readEventPromotion().active).toBe(false);
    expect(eventAllowsModel(PROMOTED, 'free')).toBe(false);
  });

  it('grants the allowlisted models to free when the flag is on', () => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: `${PROMOTED},${PROMOTED_OTHER}` });

    expect(eventAllowsModel(PROMOTED, 'free')).toBe(true);
    expect(eventAllowsModel(PROMOTED_OTHER, 'free')).toBe(true);
    expect(eventAllowsModel(UNPROMOTED, 'free')).toBe(false);
  });

  it('expires on its own once the window closes', () => {
    const now = Date.parse('2026-09-12T12:00:00Z');
    setEvent({
      [EVENT_ENABLED_ENV]: '1',
      [EVENT_MODELS_ENV]: PROMOTED,
      [EVENT_ENDS_AT_ENV]: '2026-09-12T10:00:00Z',
    });

    expect(readEventPromotion(now).active).toBe(false);
    expect(eventAllowsModel(PROMOTED, 'free', readEventPromotion(now))).toBe(false);
  });

  it('has not begun before its start time', () => {
    const now = Date.parse('2026-09-12T08:00:00Z');
    setEvent({
      [EVENT_ENABLED_ENV]: '1',
      [EVENT_MODELS_ENV]: PROMOTED,
      [EVENT_STARTS_AT_ENV]: '2026-09-12T10:00:00Z',
    });

    expect(readEventPromotion(now).active).toBe(false);
  });

  it('is live inside the window', () => {
    const now = Date.parse('2026-09-12T11:00:00Z');
    setEvent({
      [EVENT_ENABLED_ENV]: '1',
      [EVENT_MODELS_ENV]: PROMOTED,
      [EVENT_STARTS_AT_ENV]: '2026-09-12T10:00:00Z',
      [EVENT_ENDS_AT_ENV]: '2026-09-12T23:00:00Z',
    });

    expect(readEventPromotion(now).active).toBe(true);
    expect(eventAllowsModel(PROMOTED, 'free', readEventPromotion(now))).toBe(true);
  });

  it('drops a single model without touching the rest', () => {
    setEvent({
      [EVENT_ENABLED_ENV]: '1',
      [EVENT_MODELS_ENV]: `${PROMOTED},${PROMOTED_OTHER}`,
      [EVENT_DISABLED_MODELS_ENV]: PROMOTED,
    });

    expect(eventAllowsModel(PROMOTED, 'free')).toBe(false);
    expect(eventAllowsModel(PROMOTED_OTHER, 'free')).toBe(true);
  });

  it('fails closed on an id the registry does not know', () => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: `${UNKNOWN_ID},  ,${PROMOTED}` });

    const promotion = readEventPromotion();
    expect(promotion.active).toBe(true);
    expect([...promotion.modelIds]).toEqual([PROMOTED]);
    expect(eventAllowsModel(UNKNOWN_ID, 'free')).toBe(false);
  });

  it('is inactive when every allowlisted id is unusable', () => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: UNKNOWN_ID });

    expect(readEventPromotion().active).toBe(false);
  });

  it.each(PAID_TIERS)('never changes what %s can reach', (tier) => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: `${PROMOTED},${PROMOTED_OTHER}` });

    // The overlay adds nothing for a paid plan, and because it only ever adds,
    // it cannot take anything away either.
    expect(eventAllowsModel(PROMOTED, tier)).toBe(false);
    expect(eventModelIdsFor(tier).size).toBe(0);
  });

  it('reports the promoted set for badges', () => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: `${PROMOTED},${PROMOTED_OTHER}` });

    expect([...eventModelIdsFor('free')].sort()).toEqual([PROMOTED, PROMOTED_OTHER]);
    expect(eventModelIdsFor('pro').size).toBe(0);
  });

  /**
   * A supplier going down, throttling or over its own budget is a different
   * failure from one model behaving badly, and during an event the operator has
   * to drop the supplier without naming each of its models.
   */
  describe('per provider kill switch', () => {
    const PROVIDER_OF = (id: string) => listManagedRoutesForModel(id).map((r) => r.provider);

    it('guards the fixture: the two models are served by different providers', () => {
      const first = new Set(PROVIDER_OF(PROMOTED));
      const second = new Set(PROVIDER_OF(PROMOTED_OTHER));

      expect(first.size).toBeGreaterThan(0);
      expect([...second].some((provider) => !first.has(provider))).toBe(true);
    });

    it('withdraws every promoted model a disabled provider serves', () => {
      const [provider] = PROVIDER_OF(PROMOTED);
      setEvent({
        [EVENT_ENABLED_ENV]: '1',
        [EVENT_MODELS_ENV]: PROMOTED,
        [EVENT_DISABLED_PROVIDERS_ENV]: PROVIDER_OF(PROMOTED).join(','),
      });

      expect(provider).toBeTruthy();
      expect(eventAllowsModel(PROMOTED, 'free')).toBe(false);
    });

    it('leaves models served by other providers promoted', () => {
      setEvent({
        [EVENT_ENABLED_ENV]: '1',
        [EVENT_MODELS_ENV]: `${PROMOTED},${PROMOTED_OTHER}`,
        [EVENT_DISABLED_PROVIDERS_ENV]: PROVIDER_OF(PROMOTED).join(','),
      });

      expect(eventAllowsModel(PROMOTED_OTHER, 'free')).toBe(true);
    });

    it('is inert when it names a provider nobody serves', () => {
      setEvent({
        [EVENT_ENABLED_ENV]: '1',
        [EVENT_MODELS_ENV]: PROMOTED,
        [EVENT_DISABLED_PROVIDERS_ENV]: 'not-a-provider',
      });

      expect(eventAllowsModel(PROMOTED, 'free')).toBe(true);
    });

    it('goes inactive when it withdraws the last promoted model', () => {
      setEvent({
        [EVENT_ENABLED_ENV]: '1',
        [EVENT_MODELS_ENV]: PROMOTED,
        [EVENT_DISABLED_PROVIDERS_ENV]: PROVIDER_OF(PROMOTED).join(','),
      });

      expect(readEventPromotion().active).toBe(false);
    });

    it('reverses cleanly, restoring the promoted set', () => {
      const disabled = PROVIDER_OF(PROMOTED).join(',');
      setEvent({
        [EVENT_ENABLED_ENV]: '1',
        [EVENT_MODELS_ENV]: PROMOTED,
        [EVENT_DISABLED_PROVIDERS_ENV]: disabled,
      });
      expect(eventAllowsModel(PROMOTED, 'free')).toBe(false);

      setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: PROMOTED });
      expect(eventAllowsModel(PROMOTED, 'free')).toBe(true);
    });
  });

  it('turns off cleanly, restoring permanent free behaviour', () => {
    setEvent({ [EVENT_ENABLED_ENV]: '1', [EVENT_MODELS_ENV]: PROMOTED });
    expect(eventAllowsModel(PROMOTED, 'free')).toBe(true);

    setEvent({ [EVENT_MODELS_ENV]: PROMOTED }); // flag removed, nothing else changed
    expect(eventAllowsModel(PROMOTED, 'free')).toBe(false);
  });
});
