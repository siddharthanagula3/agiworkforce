/**
 * Price Tier Mapping Tests
 *
 * Tests for Stripe price ID to plan tier mapping
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

describe('Price Tier Mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Set up test price IDs
    process.env['STRIPE_PRICE_HOBBY_MONTHLY'] = 'price_hobby_monthly_123';
    process.env['STRIPE_PRICE_HOBBY_YEARLY'] = 'price_hobby_yearly_123';
    process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_monthly_456';
    process.env['STRIPE_PRICE_PRO_YEARLY'] = 'price_pro_yearly_456';
    process.env['STRIPE_PRICE_MAX_MONTHLY'] = 'price_max_monthly_789';
    process.env['STRIPE_PRICE_MAX_YEARLY'] = 'price_max_yearly_789';
    process.env['STRIPE_PRICE_ENTERPRISE_MONTHLY'] = 'price_enterprise_monthly_000';
    process.env['STRIPE_PRICE_ENTERPRISE_YEARLY'] = 'price_enterprise_yearly_000';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getPlanTierFromPriceId', () => {
    it('should return hobby tier for hobby price IDs', async () => {
      const { getPlanTierFromPriceId } = await import('@/lib/price-tier-mapping');

      expect(getPlanTierFromPriceId('price_hobby_monthly_123')).toBe('hobby');
      expect(getPlanTierFromPriceId('price_hobby_yearly_123')).toBe('hobby');
    });

    it('should return pro tier for pro price IDs', async () => {
      const { getPlanTierFromPriceId } = await import('@/lib/price-tier-mapping');

      expect(getPlanTierFromPriceId('price_pro_monthly_456')).toBe('pro');
      expect(getPlanTierFromPriceId('price_pro_yearly_456')).toBe('pro');
    });

    it('should return max tier for max price IDs', async () => {
      const { getPlanTierFromPriceId } = await import('@/lib/price-tier-mapping');

      expect(getPlanTierFromPriceId('price_max_monthly_789')).toBe('max');
      expect(getPlanTierFromPriceId('price_max_yearly_789')).toBe('max');
    });

    it('should return enterprise tier for enterprise price IDs', async () => {
      const { getPlanTierFromPriceId } = await import('@/lib/price-tier-mapping');

      expect(getPlanTierFromPriceId('price_enterprise_monthly_000')).toBe('enterprise');
      expect(getPlanTierFromPriceId('price_enterprise_yearly_000')).toBe('enterprise');
    });

    it('should return null for unknown price IDs', async () => {
      const { getPlanTierFromPriceId } = await import('@/lib/price-tier-mapping');

      expect(getPlanTierFromPriceId('price_unknown_123')).toBeNull();
      expect(getPlanTierFromPriceId('invalid')).toBeNull();
    });

    it('should return null for null/undefined input', async () => {
      const { getPlanTierFromPriceId } = await import('@/lib/price-tier-mapping');

      expect(getPlanTierFromPriceId(null)).toBeNull();
      expect(getPlanTierFromPriceId(undefined)).toBeNull();
    });

    it('should handle case-insensitive price IDs', async () => {
      const { getPlanTierFromPriceId } = await import('@/lib/price-tier-mapping');

      expect(getPlanTierFromPriceId('PRICE_HOBBY_MONTHLY_123')).toBe('hobby');
      expect(getPlanTierFromPriceId('Price_Pro_Monthly_456')).toBe('pro');
    });

    it('should trim whitespace from price IDs', async () => {
      const { getPlanTierFromPriceId } = await import('@/lib/price-tier-mapping');

      expect(getPlanTierFromPriceId('  price_hobby_monthly_123  ')).toBe('hobby');
    });
  });

  describe('resolvePlanTier', () => {
    it('should prefer metadata over price ID', async () => {
      const { resolvePlanTier } = await import('@/lib/price-tier-mapping');

      const metadata = { plan_tier: 'enterprise' };
      const result = resolvePlanTier(metadata, 'price_hobby_monthly_123');

      expect(result).toBe('enterprise');
    });

    it('should fall back to price ID when metadata is missing', async () => {
      const { resolvePlanTier } = await import('@/lib/price-tier-mapping');

      const result = resolvePlanTier(null, 'price_pro_monthly_456');

      expect(result).toBe('pro');
    });

    it('should fall back to price ID when metadata has no plan_tier', async () => {
      const { resolvePlanTier } = await import('@/lib/price-tier-mapping');

      const metadata = { other_field: 'value' };
      const result = resolvePlanTier(metadata, 'price_max_monthly_789');

      expect(result).toBe('max');
    });

    it('should return null when neither metadata nor price mapping exists', async () => {
      const { resolvePlanTier } = await import('@/lib/price-tier-mapping');

      const result = resolvePlanTier(null, 'unknown_price');

      expect(result).toBeNull();
    });

    it('should normalize metadata plan_tier to lowercase', async () => {
      const { resolvePlanTier } = await import('@/lib/price-tier-mapping');

      const metadata = { plan_tier: 'PRO' };
      const result = resolvePlanTier(metadata, null);

      expect(result).toBe('pro');
    });
  });

  describe('isValidPlanTier', () => {
    it('should return true for valid tiers', async () => {
      const { isValidPlanTier } = await import('@/lib/price-tier-mapping');

      expect(isValidPlanTier('free')).toBe(true);
      expect(isValidPlanTier('hobby')).toBe(true);
      expect(isValidPlanTier('pro')).toBe(true);
      expect(isValidPlanTier('max')).toBe(true);
      expect(isValidPlanTier('enterprise')).toBe(true);
    });

    it('should return false for invalid tiers', async () => {
      const { isValidPlanTier } = await import('@/lib/price-tier-mapping');

      expect(isValidPlanTier('invalid')).toBe(false);
      expect(isValidPlanTier('premium')).toBe(false);
      expect(isValidPlanTier('basic')).toBe(false);
    });

    it('should return false for null/undefined', async () => {
      const { isValidPlanTier } = await import('@/lib/price-tier-mapping');

      expect(isValidPlanTier(null)).toBe(false);
      expect(isValidPlanTier(undefined)).toBe(false);
    });

    it('should handle case-insensitive tier names', async () => {
      const { isValidPlanTier } = await import('@/lib/price-tier-mapping');

      expect(isValidPlanTier('PRO')).toBe(true);
      expect(isValidPlanTier('Pro')).toBe(true);
      expect(isValidPlanTier('ENTERPRISE')).toBe(true);
    });
  });

  describe('getAllRegisteredPriceIds', () => {
    it('should return all registered price IDs', async () => {
      const { getAllRegisteredPriceIds } = await import('@/lib/price-tier-mapping');

      const priceIds = getAllRegisteredPriceIds();

      expect(priceIds).toContain('price_hobby_monthly_123');
      expect(priceIds).toContain('price_pro_monthly_456');
      expect(priceIds).toContain('price_max_monthly_789');
      expect(priceIds.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('isPriceIdRegistered', () => {
    it('should return true for registered price IDs', async () => {
      const { isPriceIdRegistered } = await import('@/lib/price-tier-mapping');

      expect(isPriceIdRegistered('price_hobby_monthly_123')).toBe(true);
      expect(isPriceIdRegistered('price_pro_yearly_456')).toBe(true);
    });

    it('should return false for unregistered price IDs', async () => {
      const { isPriceIdRegistered } = await import('@/lib/price-tier-mapping');

      expect(isPriceIdRegistered('price_unknown')).toBe(false);
      expect(isPriceIdRegistered('invalid')).toBe(false);
    });

    it('should return false for null/undefined', async () => {
      const { isPriceIdRegistered } = await import('@/lib/price-tier-mapping');

      expect(isPriceIdRegistered(null)).toBe(false);
      expect(isPriceIdRegistered(undefined)).toBe(false);
    });
  });

  describe('getMappingStatus', () => {
    it('should return mapping statistics', async () => {
      const { getMappingStatus } = await import('@/lib/price-tier-mapping');

      const status = getMappingStatus();

      expect(status.totalMapped).toBeGreaterThan(0);
      expect(status.tiers).toBeDefined();
      expect(status.tiers['hobby']).toBeDefined();
      expect(status.tiers['pro']).toBeDefined();
      expect(status.tiers['max']).toBeDefined();
      expect(status.tiers['enterprise']).toBeDefined();
    });

    it('should group price IDs by tier', async () => {
      const { getMappingStatus } = await import('@/lib/price-tier-mapping');

      const status = getMappingStatus();

      expect(status.tiers['hobby']!.length).toBeGreaterThanOrEqual(2); // monthly + yearly
      expect(status.tiers['pro']!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PRICE_ID_OVERRIDES', () => {
    it('should support overrides via environment variable', async () => {
      process.env['PRICE_ID_OVERRIDES'] = 'custom_price_1,hobby:custom_price_2,enterprise';

      vi.resetModules();
      const { getPlanTierFromPriceId } = await import('@/lib/price-tier-mapping');

      expect(getPlanTierFromPriceId('custom_price_1')).toBe('hobby');
      expect(getPlanTierFromPriceId('custom_price_2')).toBe('enterprise');
    });

    it('should handle malformed overrides gracefully', async () => {
      process.env['PRICE_ID_OVERRIDES'] = 'invalid:format:here::';

      vi.resetModules();
      const { getPlanTierFromPriceId } = await import('@/lib/price-tier-mapping');

      // Should still work for regular price IDs
      expect(getPlanTierFromPriceId('price_hobby_monthly_123')).toBe('hobby');
    });
  });
});
