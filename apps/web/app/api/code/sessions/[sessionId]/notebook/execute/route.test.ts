import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockCsrf,
  mockRateLimit,
  mockE2bReady,
  mockManagedComputeBeta,
  mockRunCell,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockCsrf: vi.fn(),
  mockRateLimit: vi.fn(),
  mockE2bReady: vi.fn(),
  mockManagedComputeBeta: vi.fn(),
  mockRunCell: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/e2b/gate', () => ({ e2bProvisioningReady: mockE2bReady }));
vi.mock('@/lib/managed-compute-gate', () => ({
  isManagedComputePrivateBetaEnabled: mockManagedComputeBeta,
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(async () => ({ plan_tier: 'pro', status: 'active' })),
  },
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, runCloudCodeNotebookCell: mockRunCell };
});

import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
} from '@/lib/services/cloud-code-session-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { POST } from './route';

const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };
const SESSION = {
  id: SESSION_ID,
  title: 'notebook',
  repositoryUrl: null,
  repositoryBranch: null,
  networkAccess: 'none',
  runtimeId: 'code-interpreter-v1',
  extraHosts: [],
  state: 'ready',
  workspacePath: '/home/user',
  lastError: null,
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
  closedAt: null,
};

function postRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/notebook/execute`, {
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
  mockManagedComputeBeta.mockReturnValue(true);
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mockRunCell.mockResolvedValue({ session: SESSION, ok: true, outputs: [] });
});

describe('POST /notebook/execute', () => {
  it('runs the cell through the service and returns its result', async () => {
    const response = await POST(postRequest({ code: 'print(1)', language: 'python' }), context);

    expect(response.status).toBe(200);
    expect(mockRunCell).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      { code: 'print(1)', language: 'python' },
      'pro',
    );
    await expect(response.json()).resolves.toEqual({ session: SESSION, ok: true, outputs: [] });
  });

  it('refuses when managed Code is not provisioned for this deployment', async () => {
    mockE2bReady.mockReturnValue(false);
    const response = await POST(postRequest({ code: 'print(1)', language: 'python' }), context);
    expect(response.status).toBe(503);
    expect(mockRunCell).not.toHaveBeenCalled();
  });

  it('refuses when the managed-compute beta gate is closed', async () => {
    mockManagedComputeBeta.mockReturnValue(false);
    const response = await POST(postRequest({ code: 'print(1)', language: 'python' }), context);
    expect(response.status).toBe(503);
    expect(mockRunCell).not.toHaveBeenCalled();
  });

  it('rejects an invalid JSON body before touching the service', async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/code/sessions/${SESSION_ID}/notebook/execute`,
      { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json' } },
    );
    const response = await POST(request, context);
    expect(response.status).toBe(400);
    expect(mockRunCell).not.toHaveBeenCalled();
  });

  it('refuses a delinquent enterprise workspace with the billing gate code', async () => {
    vi.mocked(SubscriptionService.getSubscription).mockResolvedValueOnce({
      plan_tier: 'enterprise',
      status: 'canceled',
    } as never);

    const response = await POST(postRequest({ code: 'print(1)', language: 'python' }), context);

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('subscription_inactive');
    expect(mockRunCell).not.toHaveBeenCalled();
  });

  it.each([
    [new CloudCodeValidationError('bad'), 400],
    [new CloudCodeConflictError('bad'), 409],
    [new CloudCodeNotFoundError(), 404],
    [new CloudCodeUnavailableError('bad'), 503],
  ] as const)('maps %s to status %d', async (error, expectedStatus) => {
    mockRunCell.mockRejectedValueOnce(error);
    const response = await POST(postRequest({ code: 'print(1)', language: 'python' }), context);
    expect(response.status).toBe(expectedStatus);
  });
});
