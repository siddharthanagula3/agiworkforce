import { api } from '../services/api';
import { fetchUsageSnapshot } from '../services/usage';

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

describe('mobile usage meter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads the canonical percentage and reset through the public service', async () => {
    jest.spyOn(api, 'get').mockResolvedValueOnce(SUMMARY);
    const usage = await fetchUsageSnapshot();
    expect(usage.usagePercentage).toBe(37);
    expect(usage.usageResetAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('preserves Ultra’s absent session window and active weekly allowance', async () => {
    jest.spyOn(api, 'get').mockResolvedValueOnce({
      ...SUMMARY,
      plan_tier: 'max_15x',
      effective_plan_tier: 'max_15x',
      session_usage_percentage: 0,
      session_reset_at: null,
      credits: {
        monthly: { allowance: 20_000, used: 0, remaining: 20_000, reset_at: null },
        weekly: { allowance: 5_000, used: 0, remaining: 5_000, reset_at: null },
        five_hour: null,
        flagship_weekly: null,
        purchased: { remaining: 0, overage_enabled: false },
      },
    });
    const usage = await fetchUsageSnapshot();
    expect(usage.credits?.five_hour).toBeNull();
    expect(usage.sessionResetAt).toBeNull();
    expect(usage.credits?.weekly.remaining).toBe(5_000);
  });
});
