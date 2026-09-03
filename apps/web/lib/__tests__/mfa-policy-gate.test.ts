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
vi.mock('@/lib/rate-limit', () => ({
  getSharedRedisClient: vi.fn(() => mocks.redisClient),
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({ users: { getUser: mocks.getUser } })),
}));

const { buildMfaPolicyGateResponse } = await import('../mfa-policy-gate');

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions');

function policyWith(requireMfa: boolean) {
  return {
    requireMfa,
    secretHandling: 'redact',
    monthlySpendCapCents: null,
  } as unknown as Parameters<typeof mocks.resolveMfaPolicy>[0];
}

describe('buildMfaPolicyGateResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisClient = null;
  });

  it('returns null for a personal-scope request', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({ policy: null, organizationId: null });

    const response = await buildMfaPolicyGateResponse('user-1', request);

    expect(response).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('returns null when the workspace does not require mfa, without calling Clerk', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(false),
      organizationId: ORGANIZATION_ID,
    });

    const response = await buildMfaPolicyGateResponse('user-1', request);

    expect(response).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('allows an enrolled caller when the workspace requires mfa', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });
    mocks.getUser.mockResolvedValue({ twoFactorEnabled: true });

    const response = await buildMfaPolicyGateResponse('user-1', request);

    expect(response).toBeNull();
  });

  it('refuses an unenrolled caller with a plain mfa_required error', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });
    mocks.getUser.mockResolvedValue({ twoFactorEnabled: false });

    const response = await buildMfaPolicyGateResponse('user-1', request);

    expect(response?.status).toBe(403);
    const body = await response?.json();
    expect(body.error.code).toBe('mfa_required');
    expect(body.error.message).toContain('two-factor');
  });

  it('fails closed and refuses when the Clerk lookup throws', async () => {
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });
    mocks.getUser.mockRejectedValue(new Error('clerk outage'));

    const response = await buildMfaPolicyGateResponse('user-1', request);

    expect(response?.status).toBe(403);
  });

  it('uses a cached enrolled verdict instead of calling Clerk again', async () => {
    mocks.redisClient = { get: vi.fn(async () => 'enrolled'), set: mocks.redisSet };
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });

    const response = await buildMfaPolicyGateResponse('user-1', request);

    expect(response).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('uses a cached unenrolled verdict to refuse without calling Clerk again', async () => {
    mocks.redisClient = { get: vi.fn(async () => 'unenrolled'), set: mocks.redisSet };
    mocks.resolveMfaPolicy.mockResolvedValue({
      policy: policyWith(true),
      organizationId: ORGANIZATION_ID,
    });

    const response = await buildMfaPolicyGateResponse('user-1', request);

    expect(response?.status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
