import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockRateLimit,
  mockE2bReady,
  mockBetaEnabled,
  mockReadChanges,
  mockGetSubscription,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockRateLimit: vi.fn(),
  mockE2bReady: vi.fn(),
  mockBetaEnabled: vi.fn(),
  mockReadChanges: vi.fn(),
  mockGetSubscription: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
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
  SubscriptionService: { getSubscription: mockGetSubscription },
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, readCloudCodeSessionChanges: mockReadChanges };
});

import { CloudCodeConflictError } from '@/lib/services/cloud-code-session-service';
import { GET } from './route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function changesRequest(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/changes`);
}

const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockE2bReady.mockReturnValue(true);
  mockBetaEnabled.mockReturnValue(true);
  mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mockReadChanges.mockResolvedValue({
    session: { id: SESSION_ID },
    base: 'origin/main',
    workingBranch: 'agi/task-11111111',
    files: [{ path: 'src/app.ts', state: 'modified' }],
    diff: 'diff --git a/src/app.ts b/src/app.ts\n',
    diffTruncated: false,
  });
});

describe('GET /api/code/sessions/[sessionId]/changes', () => {
  it('answers with the branch flow, the changed files and the diff', async () => {
    const response = await GET(changesRequest(), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      base: 'origin/main',
      workingBranch: 'agi/task-11111111',
      files: [{ path: 'src/app.ts', state: 'modified' }],
    });
    expect(mockReadChanges).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      'pro',
    );
  });

  it('passes a closed or archived refusal through as a 409', async () => {
    mockReadChanges.mockRejectedValue(
      new CloudCodeConflictError('This Code session is archived. Unarchive it to show changes.'),
    );
    const response = await GET(changesRequest(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringMatching(/unarchive/i) },
    });
  });

  it('refuses when managed Code is not enabled for the deployment', async () => {
    mockE2bReady.mockReturnValue(false);
    const response = await GET(changesRequest(), context);
    expect(response.status).toBe(503);
    expect(mockReadChanges).not.toHaveBeenCalled();
  });

  it('stops at the rate limiter before reading anything', async () => {
    mockRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await GET(changesRequest(), context);
    expect(response.status).toBe(429);
    expect(mockReadChanges).not.toHaveBeenCalled();
  });
});
