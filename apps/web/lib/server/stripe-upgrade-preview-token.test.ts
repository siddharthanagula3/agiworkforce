import { describe, expect, it } from 'vitest';
import {
  createUpgradePreviewToken,
  verifyUpgradePreviewToken,
} from './stripe-upgrade-preview-token';

const SECRET = 'sk_test_preview_signing_secret';
const NOW_MS = Date.parse('2026-07-23T10:00:00.000Z');

describe('Stripe upgrade preview tokens', () => {
  it('binds the preview timestamp to the user, plan, interval, and subscription', () => {
    const token = createUpgradePreviewToken(
      {
        userId: 'user_123',
        plan: 'max_15x',
        billingInterval: 'monthly',
        stripeSubscriptionId: 'sub_123',
        seats: 1,
        prorationDate: Math.floor(NOW_MS / 1000),
      },
      SECRET,
      NOW_MS,
    );

    expect(
      verifyUpgradePreviewToken(
        token,
        {
          userId: 'user_123',
          plan: 'max_15x',
          billingInterval: 'monthly',
          stripeSubscriptionId: 'sub_123',
          seats: 1,
        },
        SECRET,
        NOW_MS + 60_000,
      ),
    ).toMatchObject({
      prorationDate: Math.floor(NOW_MS / 1000),
    });
  });

  it('rejects tampering and expired previews', () => {
    const token = createUpgradePreviewToken(
      {
        userId: 'user_123',
        plan: 'max_15x',
        billingInterval: 'monthly',
        stripeSubscriptionId: 'sub_123',
        seats: 1,
        prorationDate: Math.floor(NOW_MS / 1000),
      },
      SECRET,
      NOW_MS,
    );

    expect(() =>
      verifyUpgradePreviewToken(
        `${token.slice(0, -1)}x`,
        {
          userId: 'user_123',
          plan: 'max_15x',
          billingInterval: 'monthly',
          stripeSubscriptionId: 'sub_123',
          seats: 1,
        },
        SECRET,
        NOW_MS,
      ),
    ).toThrow(/invalid/i);
    expect(() =>
      verifyUpgradePreviewToken(
        token,
        {
          userId: 'user_123',
          plan: 'max_15x',
          billingInterval: 'monthly',
          stripeSubscriptionId: 'sub_123',
          seats: 1,
        },
        SECRET,
        NOW_MS + 11 * 60_000,
      ),
    ).toThrow(/expired/i);
  });

  it('refuses a token whose seat count does not match the applied seat count', () => {
    const twoSeatToken = createUpgradePreviewToken(
      {
        userId: 'user_123',
        plan: 'team',
        billingInterval: 'monthly',
        stripeSubscriptionId: 'sub_123',
        seats: 2,
        prorationDate: Math.floor(NOW_MS / 1000),
      },
      SECRET,
      NOW_MS,
    );

    expect(() =>
      verifyUpgradePreviewToken(
        twoSeatToken,
        {
          userId: 'user_123',
          plan: 'team',
          billingInterval: 'monthly',
          stripeSubscriptionId: 'sub_123',
          seats: 50,
        },
        SECRET,
        NOW_MS + 60_000,
      ),
    ).toThrow(/invalid/i);

    expect(
      verifyUpgradePreviewToken(
        twoSeatToken,
        {
          userId: 'user_123',
          plan: 'team',
          billingInterval: 'monthly',
          stripeSubscriptionId: 'sub_123',
          seats: 2,
        },
        SECRET,
        NOW_MS + 60_000,
      ),
    ).toMatchObject({ seats: 2 });
  });
});
