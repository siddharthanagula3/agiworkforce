import { describe, expect, it } from 'vitest';

import { MODEL_SAFE_FACT_KEYS, toModelSafeAccountFacts } from '../model-safe-facts';
import type { SupportAccountContext } from '../types';

function context(overrides: Partial<SupportAccountContext> = {}): SupportAccountContext {
  return {
    plan: {
      tier: 'pro',
      effectiveTier: 'pro',
      displayName: 'Pro',
      status: 'active',
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
      subscriptionSource: 'stripe',
    },
    usage: {
      usagePercentage: 42,
      sessionUsagePercentage: 10,
      weeklyUsagePercentage: 30,
      flagshipWeeklyUsagePercentage: 5,
      usageResetAt: '2026-09-01T00:00:00.000Z',
      sessionResetAt: null,
      weeklyResetAt: null,
      hasUsageRemaining: true,
    },
    connectors: [
      { id: 'row-1', connectorId: 'slack', source: 'user', connectedAt: null },
      { id: 'row-2', connectorId: 'custom-9f2a', source: 'custom', connectedAt: null },
    ],
    apiKeys: { activeCount: 3, atCeiling: false },
    email: { present: true, verified: 'verified' },
    resolvedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('toModelSafeAccountFacts', () => {
  it('emits exactly the allowlisted keys and nothing else', () => {
    const facts = toModelSafeAccountFacts(context());
    expect(Object.keys(facts).sort()).toEqual([...MODEL_SAFE_FACT_KEYS].sort());
  });

  it('carries no identifier, credential, address or private allowance key', () => {
    const facts = toModelSafeAccountFacts(context());
    for (const key of Object.keys(facts)) {
      expect(key, `"${key}" looks like a key that must not reach a model prompt`).not.toMatch(
        /cents|units|budget|allowance|micro|email_address|user_?id|key_?prefix|token|secret/iu,
      );
    }
    expect(facts.email_verification_state).toBe('verified');
  });

  it('never serializes a value that looks like an identifier or an address', () => {
    const serialized = JSON.stringify(toModelSafeAccountFacts(context()));
    expect(serialized).not.toMatch(/user_a|@/u);
    expect(serialized).not.toContain('row-1');
    expect(serialized).not.toContain('row-2');
  });

  it('drops user-authored connector names and URLs, keeping only ids', () => {
    const facts = toModelSafeAccountFacts(context());
    expect(facts.connector_ids).toEqual(['slack', 'custom-9f2a']);
    expect(facts.connector_count).toBe(2);
    expect(JSON.stringify(facts)).not.toMatch(/https?:\/\//u);
  });

  it('reports only percentages for usage, never a raw allowance operand', () => {
    const facts = toModelSafeAccountFacts(context());
    const numericKeys = Object.entries(facts)
      .filter(([, v]) => typeof v === 'number')
      .map(([k]) => k)
      .sort();
    expect(numericKeys).toEqual(
      [
        'connector_count',
        'active_api_key_count',
        'usage_percentage',
        'session_usage_percentage',
        'weekly_usage_percentage',
        'flagship_weekly_usage_percentage',
      ].sort(),
    );
  });

  it('reports unknown rather than guessing when usage or verification could not be resolved', () => {
    const facts = toModelSafeAccountFacts(
      context({ usage: null, email: { present: false, verified: 'unknown' } }),
    );
    expect(facts.usage_percentage).toBeNull();
    expect(facts.has_usage_remaining).toBeNull();
    expect(facts.email_verification_state).toBe('unknown');
  });

  it('keeps the raw and effective tier distinct so a canceled plan is not reported as paid access', () => {
    const facts = toModelSafeAccountFacts(
      context({
        plan: {
          tier: 'pro',
          effectiveTier: 'free',
          displayName: 'Pro',
          status: 'canceled',
          currentPeriodEnd: null,
          subscriptionSource: 'stripe',
        },
      }),
    );
    expect(facts.plan_tier).toBe('pro');
    expect(facts.effective_plan_tier).toBe('free');
    expect(facts.subscription_status).toBe('canceled');
  });
});
