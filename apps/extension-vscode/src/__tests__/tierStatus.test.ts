
import { describe, it, expect } from 'vitest';
import { AgiWorkforcePaywallError } from '../utils/api';

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
