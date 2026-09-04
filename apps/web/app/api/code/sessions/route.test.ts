import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockCsrf,
  mockRateLimit,
  mockE2bReady,
  mockBetaEnabled,
  mockCreateSession,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockCsrf: vi.fn(),
  mockRateLimit: vi.fn(),
  mockE2bReady: vi.fn(),
  mockBetaEnabled: vi.fn(),
  mockCreateSession: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/e2b/gate', () => ({ e2bProvisioningReady: mockE2bReady }));
vi.mock('@/lib/managed-compute-gate', () => ({
  isManagedComputePrivateBetaEnabled: mockBetaEnabled,
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(async () => ({ plan_tier: 'pro', status: 'active' })),
  },
}));
vi.mock('@/lib/e2b/templates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/e2b/templates')>();
  return { ...actual, listCloudCodeRuntimes: vi.fn(async () => []) };
});
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, createCloudCodeSession: mockCreateSession };
});

import { POST } from './route';

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/code/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCsrf.mockResolvedValue(null);
  mockRateLimit.mockResolvedValue(null);
  mockE2bReady.mockReturnValue(true);
  mockBetaEnabled.mockReturnValue(true);
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mockCreateSession.mockResolvedValue({
    id: 'session-1',
    title: 'workspace',
    state: 'ready',
  });
});

describe('POST /api/code/sessions, the full-network interim guard', () => {
  it('refuses full network for a harness whose managed credential would enter the sandbox unproxied', async () => {
    const response = await POST(
      postRequest({
        requestId: 'req-12345678',
        title: 'workspace',
        networkAccess: 'full',
        fullNetworkAcknowledged: true,
        runtimeId: 'droid',
      }),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('network_access_requires_proxy');
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('allows full network when no coding-agent harness is selected', async () => {
    const response = await POST(
      postRequest({
        requestId: 'req-12345679',
        title: 'workspace',
        networkAccess: 'full',
        fullNetworkAcknowledged: true,
        runtimeId: null,
      }),
    );
    expect(response.status).toBe(201);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('allows a harness runtime under trusted network', async () => {
    const response = await POST(
      postRequest({
        requestId: 'req-1234567a',
        title: 'workspace',
        networkAccess: 'trusted',
        runtimeId: 'claude',
      }),
    );
    expect(response.status).toBe(201);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('allows full network for a harness the credential proxy covers', async () => {
    const response = await POST(
      postRequest({
        requestId: 'req-1234567b',
        title: 'workspace',
        networkAccess: 'full',
        fullNetworkAcknowledged: true,
        runtimeId: 'claude',
      }),
    );
    expect(response.status).toBe(201);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });
});
