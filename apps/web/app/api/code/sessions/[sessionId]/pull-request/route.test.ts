import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockRateLimit,
  mockCsrf,
  mockE2bReady,
  mockBetaEnabled,
  mockOpenPullRequest,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockRateLimit: vi.fn(),
  mockCsrf: vi.fn(),
  mockE2bReady: vi.fn(),
  mockBetaEnabled: vi.fn(),
  mockOpenPullRequest: vi.fn(),
}));

vi.mock('server-only', () => ({}));
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
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, openCloudCodeSessionPullRequest: mockOpenPullRequest };
});

import {
  CloudCodeConflictError,
  CloudCodeValidationError,
} from '@/lib/services/cloud-code-session-service';
import { POST } from './route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function pullRequestRequest(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/pull-request`, {
    method: 'POST',
  });
}

const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockE2bReady.mockReturnValue(true);
  mockBetaEnabled.mockReturnValue(true);
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mockOpenPullRequest.mockResolvedValue({
    session: { id: SESSION_ID },
    url: 'https://github.com/acme/widgets/pull/7',
    number: 7,
    alreadyOpen: false,
  });
});

describe('POST /api/code/sessions/[sessionId]/pull-request', () => {
  it('answers with the pull request it opened', async () => {
    const response = await POST(pullRequestRequest(), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      url: 'https://github.com/acme/widgets/pull/7',
      number: 7,
      alreadyOpen: false,
    });
  });

  it('answers the same way on a second call', async () => {
    mockOpenPullRequest.mockResolvedValue({
      session: { id: SESSION_ID },
      url: 'https://github.com/acme/widgets/pull/7',
      number: 7,
      alreadyOpen: true,
    });
    const response = await POST(pullRequestRequest(), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ number: 7, alreadyOpen: true });
  });

  it('refuses without a csrf token', async () => {
    mockCsrf.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(pullRequestRequest(), context);
    expect(response.status).toBe(403);
    expect(mockOpenPullRequest).not.toHaveBeenCalled();
  });

  it('passes an archived refusal through as a 409', async () => {
    mockOpenPullRequest.mockRejectedValue(
      new CloudCodeConflictError(
        'This Code session is archived. Unarchive it to open a pull request in this session.',
      ),
    );
    const response = await POST(pullRequestRequest(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringMatching(/unarchive/i) },
    });
  });

  it('passes a missing working branch through as a validation refusal', async () => {
    mockOpenPullRequest.mockRejectedValue(
      new CloudCodeValidationError('Code session has no working branch'),
    );
    const response = await POST(pullRequestRequest(), context);
    expect(response.status).toBe(400);
  });

  it('refuses when managed Code is not enabled for the deployment', async () => {
    mockE2bReady.mockReturnValue(false);
    const response = await POST(pullRequestRequest(), context);
    expect(response.status).toBe(503);
    expect(mockOpenPullRequest).not.toHaveBeenCalled();
  });
});
