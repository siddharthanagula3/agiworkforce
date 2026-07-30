import { describe, expect, it } from 'vitest';
import type { ManagedUsageSummaryResponse } from '@agiworkforce/types';
import { buildBillingInfoFromUsage } from './use-billing-queries';

const usage: ManagedUsageSummaryResponse = {
  plan_tier: 'pro',
  usage_percentage: 42,
  usage_reset_at: '2026-08-18T00:00:00.000Z',
  has_usage_remaining: true,
  period_start: '2026-07-18T00:00:00.000Z',
  period_end: '2026-08-18T00:00:00.000Z',
  subscription_status: 'past_due',
  session_usage_percentage: 20,
  session_reset_at: null,
  weekly_usage_percentage: 30,
  weekly_reset_at: null,
  flagship_weekly_usage_percentage: 10,
  flagship_weekly_reset_at: null,
};

describe('buildBillingInfoFromUsage', () => {
  it('preserves actual subscription status and periods without inventing a USD price', () => {
    const billing = buildBillingInfoFromUsage(usage);

    expect(billing.status).toBe('past_due');
    expect(billing.current_period_start).toBe('2026-07-18T00:00:00.000Z');
    expect(billing.current_period_end).toBe('2026-08-18T00:00:00.000Z');
    expect(billing.price).toBeNull();
    expect(billing.currency).toBeNull();
    expect(billing.usage).toEqual({ usedPercent: 42 });
  });

  it('keeps unknown periods and subscription state honest', () => {
    const billing = buildBillingInfoFromUsage({
      ...usage,
      period_start: null,
      period_end: null,
      subscription_status: 'none',
    });

    expect(billing.status).toBe('none');
    expect(billing.current_period_start).toBeNull();
    expect(billing.current_period_end).toBeNull();
  });

  it('derives public plan features from the shared limit and capability catalog', () => {
    const free = buildBillingInfoFromUsage({ ...usage, plan_tier: 'free' });
    const max15x = buildBillingInfoFromUsage({ ...usage, plan_tier: 'max_15x' });

    expect(free.features).toContain('1 project');
    expect(free.features).toContain('1 custom MCP server');
    expect(max15x.features).toContain('Unlimited projects');
    expect(max15x.features).toContain('Unlimited custom MCP servers');
    expect(max15x.features).toContain('Video generation');
  });
});
