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

describe('voice minutes consumption', () => {
  async function captureVoiceQuery(consumedSeconds: number) {
    const db = dbReturning(consumedSeconds);
    const decision = await assertTierUnitAllowance({
      db,
      userId: 'user-free',
      planTier: 'free',
      unit: 'voice_minutes',
      requestedUnits: 1,
    });
    const sql = (db.query as unknown as { mock: { calls: [string, string[]][] } }).mock
      .calls[0]![0];
    return { decision, sql };
  }

  it('counts live sessions as well as transcription', async () => {
    const { sql } = await captureVoiceQuery(0);

    expect(sql).toContain("usage->>'operation' in ('transcription', 'voice_live_session')");
    expect(sql).toContain("usage->>'billedSeconds'");
    expect(sql).toContain("usage->>'estimatedAudioSeconds'");
  });

  it('reads billed seconds from live rows and estimated audio seconds from transcription rows', async () => {
    const { sql } = await captureVoiceQuery(0);
    const liveBranch = sql.slice(sql.indexOf("= 'voice_live_session'"));
    const transcriptionBranch = sql.slice(
      sql.indexOf("= 'transcription'"),
      sql.indexOf("= 'voice_live_session'"),
    );

    expect(liveBranch).toContain("usage->>'billedSeconds'");
    expect(liveBranch).not.toContain("usage->>'estimatedAudioSeconds'");
    expect(transcriptionBranch).toContain("usage->>'estimatedAudioSeconds'");
    expect(transcriptionBranch).not.toContain("usage->>'billedSeconds'");
  });

  it('turns consumed seconds into whole minutes against the allowance', async () => {
    const { decision } = await captureVoiceQuery(605);

    expect(decision.consumed).toBe(11);
  });

  it('refuses a live block once the month of voice seconds fills the allowance', async () => {
    const db = dbReturning(FREE_POLICY.voiceMinutesPerMonth! * 60);

    const error = await assertTierUnitAllowance({
      db,
      userId: 'user-free',
      planTier: 'free',
      unit: 'voice_minutes',
      requestedUnits: 1,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 429, code: 'voice_minutes_monthly_limit_reached' });
  });
});
