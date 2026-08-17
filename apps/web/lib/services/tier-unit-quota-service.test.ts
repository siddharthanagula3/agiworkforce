import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { TIER_POLICIES } from '@agiworkforce/types';

import { assertTierUnitAllowance, getTierUnitAllowance } from './tier-unit-quota-service';
import { buildComputerUseSoftCapWarningHeader } from '@/lib/server/managed-usage-policy';

const MAX_POLICY = TIER_POLICIES.max;
const FREE_POLICY = TIER_POLICIES.free;

function dbReturning(consumed: number): DatabaseAdapter {
  return {
    query: vi.fn().mockResolvedValue([{ consumed }]),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

describe('tier metered-unit allowances', () => {
  it('gives the free tier a bounded voice allowance rather than an uncapped one', () => {
    expect(FREE_POLICY.allowVoice).toBe(true);
    expect(FREE_POLICY.voiceMinutesPerMonth).toBeGreaterThan(0);
    expect(getTierUnitAllowance('free', 'voice_minutes')).toEqual({
      hardLimit: FREE_POLICY.voiceMinutesPerMonth,
      softLimit: null,
    });
  });

  it('exposes both computer-use ceilings the tier policy documents', () => {
    expect(getTierUnitAllowance('max', 'computer_use_requests')).toEqual({
      hardLimit: MAX_POLICY.computerUseHardCap,
      softLimit: MAX_POLICY.computerUseSoftCap,
    });
  });

  it('fails closed when the computer-use hard cap is already consumed', async () => {
    const db = dbReturning(MAX_POLICY.computerUseHardCap!);

    const error = await assertTierUnitAllowance({
      db,
      userId: 'user-max',
      planTier: 'max',
      unit: 'computer_use_requests',
      requestedUnits: 1,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 429, code: 'computer_use_monthly_limit_reached' });
  });

  it('reports the crossed soft cap so the turn can be warned instead of refused', async () => {
    const consumed = MAX_POLICY.computerUseSoftCap!;
    const db = dbReturning(consumed);

    const decision = await assertTierUnitAllowance({
      db,
      userId: 'user-max',
      planTier: 'max',
      unit: 'computer_use_requests',
      requestedUnits: 1,
    });

    expect(decision).toMatchObject({
      unit: 'computer_use_requests',
      hardLimit: MAX_POLICY.computerUseHardCap,
      softLimit: MAX_POLICY.computerUseSoftCap,
      consumed,
      requested: 1,
      softLimitReached: true,
    });
    expect(
      buildComputerUseSoftCapWarningHeader({
        usedUnits: decision.consumed + decision.requested,
        softLimitUnits: decision.softLimit!,
      }),
    ).toContain('scope=computer_use_soft_cap');
  });

  it('counts computer-use turns from the quota feature written on settled managed usage', async () => {
    const db = dbReturning(0);

    await assertTierUnitAllowance({
      db,
      userId: 'user-max',
      planTier: 'max',
      unit: 'computer_use_requests',
      requestedUnits: 1,
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("usage->>'quotaFeature' = 'computer_use'"),
      ['user-max'],
    );
  });

  it('skips the consumption read entirely for a tier with no computer-use ceilings', async () => {
    const db = dbReturning(0);

    const decision = await assertTierUnitAllowance({
      db,
      userId: 'user-pro',
      planTier: 'pro',
      unit: 'computer_use_requests',
      requestedUnits: 1,
    });

    expect(decision).toMatchObject({ hardLimit: null, softLimit: null, softLimitReached: false });
    expect(db.query).not.toHaveBeenCalled();
  });
});
