import { describe, expect, it } from 'vitest';

import {
  FREE_CAPACITY_UNAVAILABLE_CODE,
  findRecoveryHref,
  formatFreeCapacityCountdown,
  freeCapacityRetryRemainingMs,
  isFreeCapacityUnavailableCode,
  readRetryAt,
  resolveFreeCapacityPaywallSlot,
} from './freeCapacityRecovery';

const NOW_MS = Date.parse('2026-09-01T12:00:00.000Z');
const RETRY_AT = '2026-09-01T12:00:45.000Z';

const SERVER_MESSAGE =
  'No free capacity right now. Try again shortly, upgrade your plan, or use your own provider key.';

const SERVER_RECOVERY = [
  { action: 'upgrade', href: '/pricing' },
  { action: 'byok', href: '/byok' },
] as const;

describe('isFreeCapacityUnavailableCode', () => {
  it('matches the code the free-lane stage emits', () => {
    expect(isFreeCapacityUnavailableCode(FREE_CAPACITY_UNAVAILABLE_CODE)).toBe(true);
    expect(isFreeCapacityUnavailableCode(' Free_Capacity_Unavailable ')).toBe(true);
  });

  it('does not claim a managed quota refusal', () => {
    expect(isFreeCapacityUnavailableCode('rolling_five_hour_limit_reached')).toBe(false);
    expect(isFreeCapacityUnavailableCode(undefined)).toBe(false);
  });
});

describe('readRetryAt', () => {
  it('normalises the instant the server named', () => {
    expect(readRetryAt(RETRY_AT)).toBe(RETRY_AT);
  });

  it('reports no instant rather than inventing one', () => {
    expect(readRetryAt(undefined)).toBeUndefined();
    expect(readRetryAt('shortly')).toBeUndefined();
    expect(readRetryAt(45)).toBeUndefined();
  });
});

describe('findRecoveryHref', () => {
  it('finds the destination the server chose for an action', () => {
    expect(findRecoveryHref(SERVER_RECOVERY, 'byok')).toBe('/byok');
    expect(findRecoveryHref(SERVER_RECOVERY, 'upgrade')).toBe('/pricing');
  });

  it('refuses a destination that would leave the origin', () => {
    expect(
      findRecoveryHref([{ action: 'byok', href: 'https://evil.test/byok' }], 'byok'),
    ).toBeUndefined();
    expect(
      findRecoveryHref([{ action: 'byok', href: '//evil.test/byok' }], 'byok'),
    ).toBeUndefined();
  });

  it('refuses the parser tricks that dress an off-origin hop as a path', () => {
    expect(findRecoveryHref([{ action: 'byok', href: '/\\evil.test' }], 'byok')).toBeUndefined();
    expect(findRecoveryHref([{ action: 'byok', href: '/\t/evil.test' }], 'byok')).toBeUndefined();
    expect(findRecoveryHref([{ action: 'byok', href: '/\n/evil.test' }], 'byok')).toBeUndefined();
  });

  it('reports nothing for an action the server did not offer', () => {
    expect(findRecoveryHref(SERVER_RECOVERY, 'top_up')).toBeUndefined();
    expect(findRecoveryHref(undefined, 'byok')).toBeUndefined();
  });
});

describe('freeCapacityRetryRemainingMs', () => {
  it('counts down to the instant the server named', () => {
    expect(freeCapacityRetryRemainingMs(RETRY_AT, NOW_MS)).toBe(45_000);
  });

  it('stops counting once the instant has passed', () => {
    expect(freeCapacityRetryRemainingMs(RETRY_AT, NOW_MS + 90_000)).toBeNull();
  });

  it('has nothing to count when no instant was sent', () => {
    expect(freeCapacityRetryRemainingMs(undefined, NOW_MS)).toBeNull();
    expect(freeCapacityRetryRemainingMs('soon', NOW_MS)).toBeNull();
  });

  // A quota window's resetsAtMs can be hours out; holding the retry shut for
  // that long is a dead control, not a wait. Mirrors mobile's ten-minute cap.
  it('refuses to hold the retry shut for a quota window measured in hours', () => {
    const hoursAway = new Date(NOW_MS + 4 * 60 * 60_000).toISOString();
    expect(freeCapacityRetryRemainingMs(hoursAway, NOW_MS)).toBeNull();
  });

  it('still counts a deadline inside the cap', () => {
    const justInside = new Date(NOW_MS + 9 * 60_000).toISOString();
    const justOutside = new Date(NOW_MS + 11 * 60_000).toISOString();
    expect(freeCapacityRetryRemainingMs(justInside, NOW_MS)).toBe(540_000);
    expect(freeCapacityRetryRemainingMs(justOutside, NOW_MS)).toBeNull();
  });
});

describe('formatFreeCapacityCountdown', () => {
  it('reads in seconds under a minute', () => {
    expect(formatFreeCapacityCountdown(45_000)).toBe('45s');
    expect(formatFreeCapacityCountdown(1)).toBe('1s');
  });

  it('reads in minutes and seconds above one', () => {
    expect(formatFreeCapacityCountdown(65_000)).toBe('1m 5s');
    expect(formatFreeCapacityCountdown(150_000)).toBe('2m 30s');
  });

  it('drops a zero seconds remainder', () => {
    expect(formatFreeCapacityCountdown(120_000)).toBe('2m');
  });
});

describe('resolveFreeCapacityPaywallSlot', () => {
  const base = {
    code: FREE_CAPACITY_UNAVAILABLE_CODE,
    message: SERVER_MESSAGE,
    recovery: SERVER_RECOVERY,
    planTier: 'free',
  };

  it('ignores every code that is not the free lane refusal', () => {
    expect(
      resolveFreeCapacityPaywallSlot({ ...base, code: 'rolling_five_hour_limit_reached' }),
    ).toBeNull();
    expect(resolveFreeCapacityPaywallSlot({ ...base, code: undefined })).toBeNull();
  });

  it('carries the retry instant and the byok destination the server sent', () => {
    const slot = resolveFreeCapacityPaywallSlot({ ...base, retryAt: RETRY_AT });

    expect(slot?.freeCapacity).toEqual({ retryAt: RETRY_AT, byokHref: '/byok' });
    expect(slot?.reason).toBe(SERVER_MESSAGE);
    expect(slot?.requiredTier).toBe('basic');
    expect(slot?.showUpgradeCta).toBe(true);
  });

  it('never invents a retry instant the server did not name', () => {
    const slot = resolveFreeCapacityPaywallSlot(base);

    expect(slot?.freeCapacity).toEqual({ byokHref: '/byok' });
    expect(slot?.freeCapacity?.retryAt).toBeUndefined();
  });

  it('offers the wait and the key when there is no plan left to sell', () => {
    const slot = resolveFreeCapacityPaywallSlot({ ...base, planTier: 'enterprise' });

    expect(slot?.showUpgradeCta).toBe(false);
    expect(slot?.freeCapacity?.byokHref).toBe('/byok');
  });

  it('does not describe the refusal as a limit the reader reached', () => {
    const slot = resolveFreeCapacityPaywallSlot(base);

    expect(slot?.showResetTime).toBe(false);
    expect(slot?.suggestStandardModel).toBe(false);
  });
});
