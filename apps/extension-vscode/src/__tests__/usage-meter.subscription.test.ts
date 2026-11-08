import { describe, expect, it } from 'vitest';
import { parseTierInfoResponse } from '../utils/api';

const SUMMARY = {
  plan_tier: 'pro',
  effective_plan_tier: 'pro',
  subscription_status: 'active',
  usage_percentage: 37,
  usage_reset_at: '2026-11-01T00:00:00.000Z',
  has_usage_remaining: true,
  session_usage_percentage: 4,
  session_reset_at: '2026-10-28T12:00:00.000Z',
  weekly_usage_percentage: 11,
  weekly_reset_at: '2026-11-03T00:00:00.000Z',
  flagship_weekly_usage_percentage: 2,
  flagship_weekly_reset_at: '2026-11-03T00:00:00.000Z',
};

describe('VS Code usage meter', () => {
  it('reads the canonical percentage and reset from the effective plan', () => {
    const tier = parseTierInfoResponse(SUMMARY);
    expect(tier?.tier).toBe('pro');
    expect(tier?.usagePercentage).toBe(37);
    expect(tier?.resetsAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('fails closed when the server omits the effective plan and the status is not entitled', () => {
    const tier = parseTierInfoResponse({
      ...SUMMARY,
      effective_plan_tier: undefined,
      subscription_status: 'past_due',
    });
    expect(tier?.tier).toBe('free');
  });
});
