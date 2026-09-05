import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({ users: { getUser: mocks.getUser } })),
}));

import { createUpstashKeyValueStore, type UpstashRedisLike } from '@agiworkforce/key-value';

const { assertMfaPolicy, isMfaRequiredError } = await import('../mfa-policy-gate');

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions');

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

  it('resolves for a personal-scope request', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({ policy: null, organizationId: null });

    await expect(assertMfaPolicy('user-1', request)).resolves.toBeUndefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('resolves when the workspace does not require mfa, without calling Clerk', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(false),
      organizationId: ORGANIZATION_ID,
    });

    await expect(assertMfaPolicy('user-1', request)).resolves.toBeUndefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('resolves for an enrolled caller when the workspace requires mfa', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });
    mocks.getUser.mockResolvedValue({ twoFactorEnabled: true });

    await expect(assertMfaPolicy('user-1', request)).resolves.toBeUndefined();
  });

  it('throws a recognizable, plain-copy error for an unenrolled caller', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });
    mocks.getUser.mockResolvedValue({ twoFactorEnabled: false });

    let caught: unknown;
    try {
      await assertMfaPolicy('user-1', request);
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

    await expect(assertMfaPolicy('user-1', request)).rejects.toSatisfy((error: unknown) =>
      isMfaRequiredError(error),
    );
  });

  it('uses a cached enrolled verdict instead of calling Clerk again', async () => {
    mocks.redisClient = { get: vi.fn(async () => 'enrolled'), set: mocks.redisSet };
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });

    await expect(assertMfaPolicy('user-1', request)).resolves.toBeUndefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('uses a cached unenrolled verdict to refuse without calling Clerk again', async () => {
    mocks.redisClient = { get: vi.fn(async () => 'unenrolled'), set: mocks.redisSet };
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });

    await expect(assertMfaPolicy('user-1', request)).rejects.toSatisfy((error: unknown) =>
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
