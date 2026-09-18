import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { MAX_PURCHASABLE_SEATS } from '@agiworkforce/types';

import {
  normalizeCurrency,
  normalizeEnvironment,
  normalizeInterval,
  normalizeMoney,
  normalizeProviderPeriod,
  normalizeProviderQuantity,
  normalizeProviderTimestamp,
  normalizePurchaseState,
  normalizeSubscriptionStatus,
} from '../normalize';

describe('time normalization across providers', () => {
  it('reads Stripe epoch seconds, Apple epoch millis and Google RFC 3339 as the same instant', () => {
    const instant = Date.UTC(2026, 8, 17, 12, 0, 0);
    expect(normalizeProviderTimestamp(instant / 1000, 'seconds')?.getTime()).toBe(instant);
    expect(normalizeProviderTimestamp(instant, 'milliseconds')?.getTime()).toBe(instant);
    expect(normalizeProviderTimestamp('2026-09-17T12:00:00.000Z')?.getTime()).toBe(instant);
  });

  it('returns null rather than an Invalid Date for anything unparseable', () => {
    expect(normalizeProviderTimestamp(null)).toBeNull();
    expect(normalizeProviderTimestamp('')).toBeNull();
    expect(normalizeProviderTimestamp('not a date')).toBeNull();
    expect(normalizeProviderTimestamp(Number.NaN)).toBeNull();
  });

  it('refuses a period that ends before it starts', () => {
    expect(normalizeProviderPeriod(2000, 1000)).toBeNull();
    expect(normalizeProviderPeriod(1000, 2000)).toEqual({
      startsAt: new Date(1_000_000),
      endsAt: new Date(2_000_000),
    });
  });
});

describe('quantity, currency and interval normalization', () => {
  it('clamps a quantity into the purchasable range whatever the provider sent', () => {
    expect(normalizeProviderQuantity(undefined)).toBe(1);
    expect(normalizeProviderQuantity(0)).toBe(1);
    expect(normalizeProviderQuantity(-4)).toBe(1);
    expect(normalizeProviderQuantity(1.5)).toBe(1);
    expect(normalizeProviderQuantity('12')).toBe(12);
    expect(normalizeProviderQuantity(MAX_PURCHASABLE_SEATS + 10)).toBe(MAX_PURCHASABLE_SEATS);
  });

  it('upper-cases a currency and rejects anything that is not an ISO code', () => {
    expect(normalizeCurrency('usd')).toBe('USD');
    expect(normalizeCurrency('EUR')).toBe('EUR');
    expect(normalizeCurrency('dollars')).toBeNull();
    expect(normalizeCurrency(null)).toBeNull();
  });

  it('only builds money when both the amount and the currency are sound', () => {
    expect(normalizeMoney(2500, 'usd')).toEqual({ currency: 'USD', minorUnits: 2500 });
    expect(normalizeMoney(2500, 'dollars')).toBeNull();
    expect(normalizeMoney(12.5, 'usd')).toBeNull();
    expect(normalizeMoney(null, 'usd')).toBeNull();
  });

  it('normalizes an interval and defaults a missing count to one', () => {
    expect(normalizeInterval('month', 3)).toEqual({ unit: 'month', count: 3 });
    expect(normalizeInterval('YEAR', null)).toEqual({ unit: 'year', count: 1 });
    expect(normalizeInterval('fortnight', 1)).toBeNull();
  });

  it('treats only an explicitly non-live environment as sandbox', () => {
    expect(normalizeEnvironment('Sandbox')).toBe('sandbox');
    expect(normalizeEnvironment('test')).toBe('sandbox');
    expect(normalizeEnvironment('Production')).toBe('production');
    expect(normalizeEnvironment(undefined)).toBe('production');
  });
});

describe('status normalization across providers', () => {
  it('maps each provider vocabulary onto one status set', () => {
    expect(normalizeSubscriptionStatus('stripe', 'past_due')).toEqual({
      status: 'past_due',
      mapped: true,
    });
    expect(normalizeSubscriptionStatus('stripe', 'paused')).toEqual({
      status: 'unpaid',
      mapped: true,
    });
    expect(normalizeSubscriptionStatus('apple', 4)).toEqual({ status: 'past_due', mapped: true });
    expect(normalizeSubscriptionStatus('google', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD')).toEqual({
      status: 'past_due',
      mapped: true,
    });
  });

  it('keeps a Google cancellation entitled until it expires, as the store does', () => {
    expect(normalizeSubscriptionStatus('google', 'SUBSCRIPTION_STATE_CANCELED').status).toBe(
      'active',
    );
    expect(normalizeSubscriptionStatus('google', 'SUBSCRIPTION_STATE_EXPIRED').status).toBe(
      'canceled',
    );
  });

  it('never lets an unknown provider status read as entitled', () => {
    expect(normalizeSubscriptionStatus('stripe', 'quantum_superposition')).toEqual({
      status: 'unpaid',
      mapped: false,
    });
    expect(normalizeSubscriptionStatus('google', 'SUBSCRIPTION_STATE_NEW_THING').mapped).toBe(
      false,
    );
  });

  it('derives a purchase state from the normalized status and the expiry', () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);
    expect(normalizePurchaseState('active', future)).toBe('paid');
    expect(normalizePurchaseState('active', past)).toBe('expired');
    expect(normalizePurchaseState('canceled', future)).toBe('expired');
    expect(normalizePurchaseState('incomplete', null)).toBe('processing');
    expect(normalizePurchaseState('past_due', future)).toBe('unpaid');
  });
});
