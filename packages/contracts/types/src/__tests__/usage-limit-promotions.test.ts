import { describe, expect, it } from 'vitest';

import { parseManagedUsageSummaryResponse } from '../managed-usage-balance';
import {
  formatResetsAvailable,
  formatUpliftLine,
  parseUsageLimitPromotionState,
  upliftExposure,
  upliftedCap,
} from '../usage-limit-promotions';

const HOUR_MS = 3_600_000;

describe('upliftedCap', () => {
  it('raises a cap by a whole percentage and floors it', () => {
    expect(upliftedCap(1_000, 50)).toBe(1_500);
    expect(upliftedCap(333, 10)).toBe(366);
  });

  it('leaves an uncapped window and a zero uplift alone', () => {
    expect(upliftedCap(null, 50)).toBeNull();
    expect(upliftedCap(1_000, 0)).toBe(1_000);
  });
});

describe('upliftExposure', () => {
  const base = {
    sessionCap: 100,
    weeklyCap: 1_000,
    sessionWindowHours: 5,
    weeklyWindowHours: 168,
  };

  it('bounds a weekly uplift by the extra per week times the weeks left', () => {
    expect(
      upliftExposure({ ...base, percent: 50, windows: ['weekly'], remainingMs: 10 * 24 * HOUR_MS }),
    ).toBe(2 * 500);
  });

  it('holds a 5-hour uplift alone to the weekly cap per week', () => {
    expect(
      upliftExposure({
        ...base,
        percent: 100,
        windows: ['session'],
        remainingMs: 7 * 24 * HOUR_MS,
      }),
    ).toBe(1_000);
  });

  it('is zero once the promotion has ended', () => {
    expect(upliftExposure({ ...base, percent: 50, windows: ['weekly'], remainingMs: 0 })).toBe(0);
  });
});

describe('copy', () => {
  it('counts resets the way the usage page shows them', () => {
    expect(formatResetsAvailable(0)).toBe('No resets right now');
    expect(formatResetsAvailable(1)).toBe('1 reset available');
    expect(formatResetsAvailable(3)).toBe('3 resets available');
  });

  it('names the window, the workload and the end date of an uplift', () => {
    expect(
      formatUpliftLine({ percent: 50, windows: ['weekly'], workloads: ['code'] }, 'Oct 31'),
    ).toBe('Weekly limit +50% for AGI Code until Oct 31');
    expect(
      formatUpliftLine({ percent: 100, windows: ['session', 'weekly'], workloads: [] }, 'Nov 2'),
    ).toBe('5-hour and weekly limits +100% until Nov 2');
  });
});

const STATE = {
  resets: {
    available: 1,
    grants: [{ grant_id: 'g-1', expires_at: '2026-11-01T00:00:00.000Z' }],
    can_apply: true,
    last_applied_at: null,
  },
  uplifts: [
    {
      promotion_id: 'code-week',
      percent: 50,
      windows: ['weekly'],
      workloads: ['code'],
      ends_at: '2026-10-31T00:00:00.000Z',
    },
  ],
};

const SUMMARY = {
  plan_tier: 'pro',
  usage_percentage: 10,
  usage_reset_at: null,
  has_usage_remaining: true,
  period_start: null,
  period_end: null,
  subscription_status: 'active',
  session_usage_percentage: 0,
  session_reset_at: null,
  weekly_usage_percentage: 0,
  weekly_reset_at: null,
  flagship_weekly_usage_percentage: 0,
  flagship_weekly_reset_at: null,
};

describe('parseUsageLimitPromotionState', () => {
  it('reads resets and uplifts', () => {
    expect(parseUsageLimitPromotionState(STATE)).toEqual(STATE);
  });

  it('refuses an uplift that names no window', () => {
    expect(() =>
      parseUsageLimitPromotionState({ ...STATE, uplifts: [{ ...STATE.uplifts[0], windows: [] }] }),
    ).toThrow(TypeError);
  });

  it('carries the block on the usage summary and drops one it cannot read', () => {
    expect(
      parseManagedUsageSummaryResponse({ ...SUMMARY, limit_promotions: STATE }).limit_promotions,
    ).toEqual(STATE);
    const unreadable = parseManagedUsageSummaryResponse({
      ...SUMMARY,
      limit_promotions: { resets: null },
    });
    expect(unreadable.limit_promotions).toBeUndefined();
    expect(unreadable.plan_tier).toBe('pro');
  });
});
