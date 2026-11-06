import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {},
  identity: {},
  handle: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.db }));
vi.mock('@/lib/server/identity', () => ({ getIdentityProvider: () => mocks.identity }));
vi.mock('@/lib/services/identity-events', () => ({ handleIdentitySecurityEvent: mocks.handle }));

import { announceTwoFactorChange } from '../two-factor-security-events';

beforeEach(() => {
  mocks.handle.mockReset().mockResolvedValue({ assessment: { level: 'none' }, response: null });
});

describe('two-factor security event identity scope', () => {
  it('passes an explicitly owned native subject separately from the product account', async () => {
    await announceTwoFactorChange({
      userId: 'product-account',
      identitySubject: 'native-subject',
      event: 'email_changed',
      noticeRef: 'address-id',
    });

    expect(mocks.handle).toHaveBeenCalledExactlyOnceWith(mocks.db, mocks.identity, {
      userId: 'product-account',
      identitySubject: 'native-subject',
      event: 'email_changed',
      noticeRef: 'address-id',
      organizationId: null,
    });
  });

  it('does not invent a native subject for product-only consumers', async () => {
    await announceTwoFactorChange({ userId: 'product-account', event: 'password_changed' });

    expect(mocks.handle).toHaveBeenCalledExactlyOnceWith(mocks.db, mocks.identity, {
      userId: 'product-account',
      event: 'password_changed',
      organizationId: null,
    });
  });
});
