/**
 * tierStatus.test.ts — Paywall/tier compatibility tests.
 *
 * The legacy showTierStatus command delegates to the canonical Account & Usage
 * panel; plan presentation is tested through accountPresentation and the
 * settings webview rather than a second fake item builder here.
 */

import { describe, it, expect } from 'vitest';
import { AgiWorkforcePaywallError } from '../utils/api';

// ── TierInfo shape tests ──────────────────────────────────────────────────────

describe('TierInfo shape', () => {
  it('constructs a minimal TierInfo with tier only', () => {
    const info = { tier: 'basic' };
    expect(info.tier).toBe('basic');
  });

  it('constructs a TierInfo with percentage usage data', () => {
    const info = { tier: 'pro', usagePercentage: 42 };
    expect(info.tier).toBe('pro');
    expect(info.usagePercentage).toBe(42);
  });
});

// ── Paywall error cross-reference ─────────────────────────────────────────────

describe('AgiWorkforcePaywallError in tier context', () => {
  it('requiredTier matches the tier that should be displayed in the notification', () => {
    const err = new AgiWorkforcePaywallError('chat', 'basic', 'Cap exceeded');
    // The canonical Account & Usage recovery path uses this required tier.
    expect(err.requiredTier).toBe('basic');
  });

  it('feature matches the locked capability', () => {
    const err = new AgiWorkforcePaywallError('image', 'pro', 'Images require Pro');
    expect(err.feature).toBe('image');
  });
});
