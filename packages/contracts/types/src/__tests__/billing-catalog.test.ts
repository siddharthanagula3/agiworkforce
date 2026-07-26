import { describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  SELF_SERVE_PAID_PLAN_TIERS,
  getPlanPriceCents,
  getPlanPriceInr,
  getBillingPlanProductLimits,
  getPlanMaxConcurrentTurns,
  getPlanMaxConnectorTools,
  getPlanMaxSandboxes,
  getPlanMaxScheduledTasks,
  getPlanSandboxTtlMs,
  canUseBillingPlanCapability,
  isSelfServePaidPlanTier,
  isPlanSelectableOnSurface,
  PLAN_SURFACE_VISIBILITY,
  type BillingPlanTier,
} from '../billing-catalog';

describe('billing catalog', () => {
  it('keeps Team sales-assisted until organization-linked seat billing exists', () => {
    expect(SELF_SERVE_PAID_PLAN_TIERS).toEqual(['basic', 'pro', 'max', 'max_15x']);
    expect(SELF_SERVE_PAID_PLAN_TIERS).not.toContain('team');
  });

  it('recognizes only plans that may enter self-serve checkout', () => {
    expect(isSelfServePaidPlanTier('max')).toBe(true);
    expect(isSelfServePaidPlanTier('max_15x')).toBe(true);
    expect(isSelfServePaidPlanTier('team')).toBe(false);
    expect(isSelfServePaidPlanTier('local-only')).toBe(false);
  });

  it('keeps the public catalog limited to customer-facing prices', () => {
    expect(getPlanPriceCents('pro')).toBe(2000);
    expect(getPlanPriceCents('pro', 'yearly')).toBe(20000);
    expect(getPlanPriceCents('max')).toBe(10000);
    expect(getPlanPriceCents('max_15x')).toBe(20000);
    expect(getPlanPriceCents('basic')).toBe(700);
    expect(getPlanPriceCents('team')).toBe(2500);
    expect(getPlanPriceCents('team', 'yearly')).toBe(24000);
    for (const plan of Object.values(BILLING_PLAN_PRICING)) {
      expect(plan).not.toHaveProperty('monthlyUsageBudgetUsd');
      expect(plan).not.toHaveProperty('weeklyUsageBudgetUsd');
      expect(plan).not.toHaveProperty('dailyUsageBudgetUsd');
    }
  });

  it('exposes founder-set India monthly pricing for individual paid tiers', () => {
    expect(getPlanPriceInr('basic')).toBe(399);
    expect(getPlanPriceInr('pro')).toBe(1999);
    expect(getPlanPriceInr('max')).toBe(9999);
    expect(getPlanPriceInr('max_15x')).toBe(24999);
    expect(getPlanPriceInr('team')).toBeNull();
  });

  describe('plan surface visibility', () => {
    it('offers Basic on web, desktop, and mobile', () => {
      expect(isPlanSelectableOnSurface('basic', 'web')).toBe(true);
      expect(isPlanSelectableOnSurface('basic', 'desktop')).toBe(true);
      expect(isPlanSelectableOnSurface('basic', 'mobile')).toBe(true);
    });

    it('shows every other tier on every surface', () => {
      const others: BillingPlanTier[] = [
        'local-only',
        'byok',
        'free',
        'pro',
        'max',
        'max_15x',
        'team',
        'enterprise',
      ];
      for (const tier of others) {
        expect(isPlanSelectableOnSurface(tier, 'web')).toBe(true);
        expect(isPlanSelectableOnSurface(tier, 'desktop')).toBe(true);
        expect(isPlanSelectableOnSurface(tier, 'mobile')).toBe(true);
      }
    });

    it('normalizes unknown/empty tiers to free (visible everywhere)', () => {
      expect(isPlanSelectableOnSurface('nonsense', 'web')).toBe(true);
      expect(isPlanSelectableOnSurface(null, 'web')).toBe(true);
      expect(isPlanSelectableOnSurface(undefined, 'desktop')).toBe(true);
    });

    it('keeps Basic in every customer app plan selector', () => {
      expect(PLAN_SURFACE_VISIBILITY.basic).toEqual(['web', 'desktop', 'mobile']);
      expect(getPlanPriceCents('basic')).toBe(700);
    });
  });

  describe('server-enforced capability entitlements', () => {
    it('keeps normal chat tools available on Free while paid work surfaces start at Pro', () => {
      expect(canUseBillingPlanCapability('free', 'chat_tools')).toBe(true);
      expect(canUseBillingPlanCapability('basic', 'agi_work')).toBe(false);
      expect(canUseBillingPlanCapability('pro', 'agi_work')).toBe(true);
      expect(canUseBillingPlanCapability('free', 'managed_api')).toBe(false);
      expect(canUseBillingPlanCapability('pro', 'managed_api')).toBe(true);
    });

    it('offers images from Pro and reserves video for Max 15x and Enterprise', () => {
      expect(canUseBillingPlanCapability('pro', 'image_generation')).toBe(true);
      expect(canUseBillingPlanCapability('pro', 'video_generation')).toBe(false);
      expect(canUseBillingPlanCapability('max', 'video_generation')).toBe(false);
      expect(canUseBillingPlanCapability('max_15x', 'video_generation')).toBe(true);
      expect(canUseBillingPlanCapability('team', 'video_generation')).toBe(false);
      expect(canUseBillingPlanCapability('enterprise', 'video_generation')).toBe(true);
    });

    it('fails closed for removed or unknown tier names', () => {
      expect(canUseBillingPlanCapability('hobby', 'managed_api')).toBe(false);
      expect(canUseBillingPlanCapability('pro_plus', 'video_generation')).toBe(false);
      expect(canUseBillingPlanCapability(undefined, 'chat_tools')).toBe(false);
    });
  });

  describe('managed product limits', () => {
    it('uses the founder-set project and custom MCP limits', () => {
      expect(getBillingPlanProductLimits('free')).toMatchObject({
        projects: 1,
        customMcpServers: 1,
      });
      expect(getBillingPlanProductLimits('basic')).toMatchObject({
        projects: 5,
        customMcpServers: 5,
      });
      expect(getBillingPlanProductLimits('pro')).toMatchObject({
        projects: 25,
        customMcpServers: 25,
      });
      expect(getBillingPlanProductLimits('team')).toMatchObject({
        projects: 25,
        customMcpServers: 25,
      });
      expect(getBillingPlanProductLimits('max')).toMatchObject({
        projects: 'unlimited',
        customMcpServers: 'unlimited',
      });
      expect(getBillingPlanProductLimits('max_15x')).toMatchObject({
        projects: 'unlimited',
        customMcpServers: 'unlimited',
      });
    });

    it('fails unknown cloud tiers closed instead of giving Free limits', () => {
      expect(getBillingPlanProductLimits('hobby')).toBeNull();
      expect(getBillingPlanProductLimits(undefined)).toBeNull();
    });

    // GOV-3 / GOV-4 / GOV-7: paid tiers buy real compute headroom. Sandboxes
    // intentionally plateau at the absolute five-per-user safety ceiling.
    it('scales compute dimensions across paid tiers without exceeding five sandboxes', () => {
      const tiers = ['free', 'basic', 'pro', 'max', 'max_15x'] as const;
      const turns = tiers.map((tier) => getPlanMaxConcurrentTurns(tier) ?? Number.MAX_SAFE_INTEGER);
      const sandboxes = tiers.map((tier) => getPlanMaxSandboxes(tier) ?? Number.MAX_SAFE_INTEGER);
      const ttls = tiers.map((tier) => getPlanSandboxTtlMs(tier));
      const tools = tiers.map((tier) => getPlanMaxConnectorTools(tier) ?? Number.MAX_SAFE_INTEGER);
      const tasks = tiers.map((tier) => getPlanMaxScheduledTasks(tier) ?? Number.MAX_SAFE_INTEGER);

      for (const series of [turns, ttls, tools, tasks]) {
        for (let index = 1; index < series.length; index += 1) {
          expect(series[index]!).toBeGreaterThan(series[index - 1]!);
        }
      }

      for (let index = 1; index < sandboxes.length; index += 1) {
        expect(sandboxes[index]!).toBeGreaterThanOrEqual(sandboxes[index - 1]!);
      }
      expect(Math.max(...sandboxes)).toBe(5);
    });

    it('fails unknown tiers closed and keeps Enterprise at the per-user sandbox ceiling', () => {
      expect(getPlanMaxConcurrentTurns('hobby')).toBe(0);
      expect(getPlanMaxSandboxes(undefined)).toBe(0);
      expect(getPlanMaxScheduledTasks(null)).toBe(0);
      expect(getPlanSandboxTtlMs('hobby')).toBe(0);

      expect(getPlanMaxConcurrentTurns('enterprise')).toBeNull();
      expect(getPlanMaxSandboxes('enterprise')).toBe(5);
      expect(getPlanMaxConnectorTools('enterprise')).toBeNull();
      expect(getPlanMaxScheduledTasks('enterprise')).toBeNull();
      expect(getPlanSandboxTtlMs('enterprise')).toBeGreaterThan(0);
    });

    it('denies managed sandboxes and scheduled tasks to the local trust boundary', () => {
      for (const tier of ['local-only', 'byok'] as const) {
        expect(getPlanMaxSandboxes(tier)).toBe(0);
        expect(getPlanSandboxTtlMs(tier)).toBe(0);
        expect(getPlanMaxScheduledTasks(tier)).toBe(0);
        expect(getPlanMaxConcurrentTurns(tier)).toBeNull();
      }
    });
  });
});
