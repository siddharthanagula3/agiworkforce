
import { describe, it, expect } from 'vitest';
import { AgiWorkforcePaywallError } from '../utils/api';

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

describe('AgiWorkforcePaywallError in tier context', () => {
  it('requiredTier matches the tier that should be displayed in the notification', () => {
    const err = new AgiWorkforcePaywallError('chat', 'basic', 'Cap exceeded');
    expect(err.requiredTier).toBe('basic');
  });

  it('feature matches the locked capability', () => {
    const err = new AgiWorkforcePaywallError('image', 'pro', 'Images require Pro');
    expect(err.feature).toBe('image');
  });
});
