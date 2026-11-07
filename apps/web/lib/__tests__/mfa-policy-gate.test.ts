import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

interface StubRedisClient {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options: { ex: number }) => Promise<string>;
}

const mocks = vi.hoisted(() => ({
  resolveMfaPolicy: vi.fn(),
  getUser: vi.fn(),
  redisSet: vi.fn(async () => 'OK'),
  redisClient: null as StubRedisClient | null,
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveMfaPolicy: mocks.resolveMfaPolicy,
}));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: vi.fn(() =>
    mocks.redisClient ? createUpstashKeyValueStore(mocks.redisClient as UpstashRedisLike) : null,
  ),
}));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/identity')>()),
  getIdentityUser: mocks.getUser,
}));

import { createUpstashKeyValueStore, type UpstashRedisLike } from '@agiworkforce/key-value';

const { assertMfaPolicy, isMfaRequiredError, resolveMfaEnrolled } = await import('../mfa-policy-gate');

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function policyWith(requireMfa: boolean) {
  return {
    requireMfa,
    secretHandling: 'redact',
    monthlySpendCapCents: null,
  } as unknown as Parameters<typeof mocks.resolveMfaPolicy>[0];
}

describe('assertMfaPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisClient = null;
  });

  it('resolves when the caller belongs to no governed workspace', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({ policy: null, organizationId: null });

    await expect(assertMfaPolicy('user-1')).resolves.toBeUndefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('resolves when the workspace does not require mfa, without calling Clerk', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(false),
      organizationId: ORGANIZATION_ID,
    });

    await expect(assertMfaPolicy('user-1')).resolves.toBeUndefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('resolves for an enrolled caller when the workspace requires mfa', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });
    mocks.getUser.mockResolvedValue({ twoFactorEnabled: true });

    await expect(assertMfaPolicy('user-1')).resolves.toBeUndefined();
  });

  it('throws a recognizable, plain-copy error for an unenrolled caller', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });
    mocks.getUser.mockResolvedValue({ twoFactorEnabled: false });

    let caught: unknown;
    try {
      await assertMfaPolicy('user-1');
    } catch (error) {
      caught = error;
    }

    expect(isMfaRequiredError(caught)).toBe(true);
    expect((caught as Error).message).toContain('two-factor');
  });

  it('fails closed and throws when the Clerk lookup throws', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });
    mocks.getUser.mockRejectedValue(new Error('clerk outage'));

    await expect(assertMfaPolicy('user-1')).rejects.toSatisfy((error: unknown) =>
      isMfaRequiredError(error),
    );
  });

  it('uses a cached enrolled verdict instead of calling Clerk again', async () => {
    mocks.redisClient = { get: vi.fn(async () => 'enrolled'), set: mocks.redisSet };
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });

    await expect(assertMfaPolicy('user-1')).resolves.toBeUndefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('uses a cached unenrolled verdict to refuse without calling Clerk again', async () => {
    mocks.redisClient = { get: vi.fn(async () => 'unenrolled'), set: mocks.redisSet };
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });

    await expect(assertMfaPolicy('user-1')).rejects.toSatisfy((error: unknown) =>
      isMfaRequiredError(error),
    );
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

describe('isMfaRequiredError', () => {
  it('does not match an unrelated error', () => {
    expect(isMfaRequiredError(new Error('boom'))).toBe(false);
  });
});

describe('resolveMfaEnrolled admitted session evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockReset();
    mocks.redisClient = null;
  });

  it.each([
    { accountId: 'product-account', cached: 'enrolled', enrolled: false },
    { accountId: 'native-subject', cached: 'enrolled', enrolled: false },
    { accountId: 'product-account', cached: 'unenrolled', enrolled: true },
    { accountId: 'native-subject', cached: 'unenrolled', enrolled: true },
  ])('uses native enrollment for $accountId despite $cached cache', async ({
    accountId, cached, enrolled,
  }) => {
    const get = vi.fn(async () => cached);
    mocks.redisClient = { get, set: mocks.redisSet };
    mocks.getUser.mockResolvedValue({ id: 'native-subject', twoFactorEnabled: enrolled });

    await expect(resolveMfaEnrolled(accountId, { subject: 'native-subject' })).resolves.toBe(enrolled);
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith('native-subject');
    expect(get).not.toHaveBeenCalled();
    expect(mocks.redisSet).not.toHaveBeenCalled();
    expect(mocks.resolveMfaPolicy).not.toHaveBeenCalled();
  });

  it.each([
    null,
    undefined,
    {},
    { id: 'foreign-subject', twoFactorEnabled: true },
    { twoFactorEnabled: true },
    { id: 'native-subject' },
    { id: 'native-subject', twoFactorEnabled: 'true' },
    { id: 'native-subject', twoFactorEnabled: 1 },
  ])('refuses invalid native enrollment without legacy fallback: %j', async (user) => {
    const get = vi.fn(async () => 'enrolled');
    mocks.redisClient = { get, set: mocks.redisSet };
    mocks.getUser.mockResolvedValue(user);

    await expect(
      resolveMfaEnrolled('product-account', { subject: 'native-subject' }),
    ).resolves.toBe(false);
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith('native-subject');
    expect(get).not.toHaveBeenCalled();
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('refuses blank subject %j without any lookup', async (subject) => {
    const get = vi.fn(async () => 'enrolled');
    mocks.redisClient = { get, set: mocks.redisSet };

    await expect(resolveMfaEnrolled('product-account', { subject })).resolves.toBe(false);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it('refuses a provider error without product lookup or cache fallback', async () => {
    const get = vi.fn(async () => 'enrolled');
    mocks.redisClient = { get, set: mocks.redisSet };
    mocks.getUser.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      resolveMfaEnrolled('product-account', { subject: 'native-subject' }),
    ).resolves.toBe(false);
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith('native-subject');
    expect(get).not.toHaveBeenCalled();
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it.each([
    { cached: 'enrolled', enrolled: true },
    { cached: 'unenrolled', enrolled: false },
  ])('preserves one-argument $cached cache behavior', async ({ cached, enrolled }) => {
    const get = vi.fn(async () => cached);
    mocks.redisClient = { get, set: mocks.redisSet };

    await expect(resolveMfaEnrolled('device-account')).resolves.toBe(enrolled);
    expect(get).toHaveBeenCalledExactlyOnceWith('mfa-enrolled:device-account');
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it.each([true, false])('preserves one-argument provider enrollment %s', async (enrolled) => {
    const get = vi.fn(async () => null);
    mocks.redisClient = { get, set: mocks.redisSet };
    mocks.getUser.mockResolvedValue({ twoFactorEnabled: enrolled });

    await expect(resolveMfaEnrolled('device-account')).resolves.toBe(enrolled);
    expect(get).toHaveBeenCalledExactlyOnceWith('mfa-enrolled:device-account');
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith('device-account');
    expect(mocks.redisSet).toHaveBeenCalledExactlyOnceWith(
      'mfa-enrolled:device-account',
      enrolled ? 'enrolled' : 'unenrolled',
      { ex: 300 },
    );
  });
});

describe('session-native mfa enrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisClient = null;
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });
  });

  it.each(['product-account', 'native-subject'])(
    'ignores a legacy enrolled cache for account %s when the native identity is unenrolled',
    async (accountId) => {
      const get = vi.fn(async () => 'enrolled');
      mocks.redisClient = { get, set: mocks.redisSet };
      mocks.getUser.mockResolvedValue({ id: 'native-subject', twoFactorEnabled: false });

      await expect(assertMfaPolicy(accountId, { subject: 'native-subject' })).rejects.toSatisfy(
        isMfaRequiredError,
      );
      expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith('native-subject');
      expect(get).not.toHaveBeenCalled();
      expect(mocks.redisSet).not.toHaveBeenCalled();
    },
  );

  it('ignores a legacy unenrolled cache for an enrolled native identity', async () => {
    const get = vi.fn(async () => 'unenrolled');
    mocks.redisClient = { get, set: mocks.redisSet };
    mocks.getUser.mockResolvedValue({ id: 'native-subject', twoFactorEnabled: true });

    await expect(
      assertMfaPolicy('product-account', { subject: 'native-subject' }),
    ).resolves.toBeUndefined();
    expect(mocks.resolveMfaPolicy).toHaveBeenCalledWith(expect.anything(), 'product-account');
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith('native-subject');
    expect(get).not.toHaveBeenCalled();
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { id: 'foreign-subject', twoFactorEnabled: true },
    { id: 'native-subject', twoFactorEnabled: 'true' },
    { id: 'native-subject' },
  ])('refuses absent, foreign or non-boolean enrollment: %j', async (user) => {
    mocks.getUser.mockResolvedValue(user);
    await expect(
      assertMfaPolicy('product-account', { subject: 'native-subject' }),
    ).rejects.toSatisfy(isMfaRequiredError);
  });

  it('fails closed on a native provider error without trying the product ID', async () => {
    mocks.getUser.mockRejectedValue(new Error('provider unavailable'));
    await expect(
      assertMfaPolicy('product-account', { subject: 'native-subject' }),
    ).rejects.toSatisfy(isMfaRequiredError);
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith('native-subject');
  });

  it.each(['', '   '])('refuses a blank native subject %j without a provider lookup', async (subject) => {
    await expect(assertMfaPolicy('product-account', { subject })).rejects.toSatisfy(
      isMfaRequiredError,
    );
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('does not read native enrollment when the workspace does not require mfa', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(false),
      organizationId: ORGANIZATION_ID,
    });
    await expect(
      assertMfaPolicy('product-account', { subject: 'native-subject' }),
    ).resolves.toBeUndefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
