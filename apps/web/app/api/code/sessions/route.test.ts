import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockCsrf,
  mockRateLimit,
  mockE2bReady,
  mockBetaEnabled,
  mockCreateSession,
  mockHasServerProviderKey,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockCsrf: vi.fn(),
  mockRateLimit: vi.fn(),
  mockE2bReady: vi.fn(),
  mockBetaEnabled: vi.fn(),
  mockCreateSession: vi.fn(),
  mockHasServerProviderKey: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/e2b/gate', () => ({
  e2bProvisioningReady: mockE2bReady,
  E2B_API_KEY_ENV: 'E2B_API_KEY',
  e2bExecutionEnabled: vi.fn(),
}));
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
vi.mock('@/lib/services/provider-adapter-service', () => ({
  hasServerProviderKey: mockHasServerProviderKey,
}));

import { SubscriptionService } from '@/lib/services/subscription-service';
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
  mockHasServerProviderKey.mockReturnValue(true);
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

  it('refuses extra egress hosts under trusted network for the same harness', async () => {
    const response = await POST(
      postRequest({
        requestId: 'req-12345690',
        title: 'workspace',
        networkAccess: 'trusted',
        runtimeId: 'droid',
        extraHosts: ['reports.example.com'],
      }),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('network_access_requires_proxy');
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('refuses a harness the proxy does not cover under trusted network with no extra hosts (D28: whatever the network preset)', async () => {
    const response = await POST(
      postRequest({
        requestId: 'req-12345692',
        title: 'workspace',
        networkAccess: 'trusted',
        runtimeId: 'droid',
      }),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('harness_credential_unavailable');
    expect(body.error.message).toContain('Droid');
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('refuses a harness the proxy does not cover with no network access at all', async () => {
    const response = await POST(
      postRequest({
        requestId: 'req-12345693',
        title: 'workspace',
        networkAccess: 'none',
        runtimeId: 'droid',
      }),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('harness_credential_unavailable');
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('allows a harness the proxy does not cover once an explicit credential is supplied, under any network preset', async () => {
    const response = await POST(
      postRequest({
        requestId: 'req-12345694',
        title: 'workspace',
        networkAccess: 'trusted',
        runtimeId: 'droid',
        harnessCredential: 'user-supplied-factory-key',
      }),
    );
    expect(response.status).toBe(201);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('allows managed mode for codex now that the credential proxy covers it', async () => {
    const response = await POST(
      postRequest({
        requestId: 'req-12345695',
        title: 'workspace',
        networkAccess: 'trusted',
        runtimeId: 'codex',
      }),
    );
    expect(response.status).toBe(201);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('allows extra egress hosts under trusted network for a proxied harness', async () => {
    const response = await POST(
      postRequest({
        requestId: 'req-12345691',
        title: 'workspace',
        networkAccess: 'trusted',
        runtimeId: 'claude',
        extraHosts: ['reports.example.com'],
      }),
    );
    expect(response.status).toBe(201);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
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

describe('POST /api/code/sessions, the managed-compute billing gate', () => {
  it('refuses session creation for a delinquent enterprise subscription', async () => {
    vi.mocked(SubscriptionService.getSubscription).mockResolvedValueOnce({
      plan_tier: 'enterprise',
      status: 'canceled',
    } as never);

    const response = await POST(
      postRequest({
        requestId: 'req-33345678',
        title: 'workspace',
        networkAccess: 'none',
        runtimeId: null,
      }),
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('subscription_inactive');
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});

describe('POST /api/code/sessions, the managed-credential availability guard', () => {
  it('rejects a harness with no managed credential and no explicit credential', async () => {
    mockHasServerProviderKey.mockReturnValue(false);
    const response = await POST(
      postRequest({
        requestId: 'req-2234567a',
        title: 'workspace',
        networkAccess: 'trusted',
        runtimeId: 'droid',
      }),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('harness_credential_unavailable');
    expect(body.error.message).toContain('Droid');
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('allows a harness with no managed credential when an explicit credential is supplied', async () => {
    mockHasServerProviderKey.mockReturnValue(false);
    const response = await POST(
      postRequest({
        requestId: 'req-2234567b',
        title: 'workspace',
        networkAccess: 'trusted',
        runtimeId: 'droid',
        harnessCredential: 'user-supplied-factory-key',
      }),
    );
    expect(response.status).toBe(201);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('allows a harness with a managed credential configured', async () => {
    const response = await POST(
      postRequest({
        requestId: 'req-2234567c',
        title: 'workspace',
        networkAccess: 'trusted',
        runtimeId: 'claude',
      }),
    );
    expect(response.status).toBe(201);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('rejects codex when the platform has no managed OpenAI key, even though the proxy covers it', async () => {
    mockHasServerProviderKey.mockReturnValue(false);
    const response = await POST(
      postRequest({
        requestId: 'req-2234567d',
        title: 'workspace',
        networkAccess: 'trusted',
        runtimeId: 'codex',
      }),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('harness_credential_unavailable');
    expect(body.error.message).toContain('Codex');
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});
