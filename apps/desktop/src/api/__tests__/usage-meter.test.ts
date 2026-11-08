import { describe, expect, it } from 'vitest';
import { readDesktopUsageSummary } from '../cloudApi';

const SUMMARY = {
  plan_tier: 'pro',
  effective_plan_tier: 'pro',
  usage_percentage: 37,
  usage_reset_at: '2026-11-01T00:00:00.000Z',
  has_usage_remaining: true,
  period_start: '2026-10-01T00:00:00.000Z',
  period_end: '2026-11-01T00:00:00.000Z',
  subscription_status: 'active',
  session_usage_percentage: 4,
  session_reset_at: '2026-10-28T12:00:00.000Z',
  weekly_usage_percentage: 11,
  weekly_reset_at: '2026-11-03T00:00:00.000Z',
  flagship_weekly_usage_percentage: 2,
  flagship_weekly_reset_at: '2026-11-03T00:00:00.000Z',
};

describe('desktop usage meter', () => {
  it('reads the canonical percentage and reset', () => {
    const usage = readDesktopUsageSummary(SUMMARY);
    expect(usage.usage_percentage).toBe(37);
    expect(usage.usage_reset_at).toBe('2026-11-01T00:00:00.000Z');
  });
});
