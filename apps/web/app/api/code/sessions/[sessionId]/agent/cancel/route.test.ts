import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetUserScopedDb, mockRateLimit, mockCsrf, mockRequestCancellation } = vi.hoisted(
  () => ({
    mockGetUserScopedDb: vi.fn(),
    mockRateLimit: vi.fn(),
    mockCsrf: vi.fn(),
    mockRequestCancellation: vi.fn(),
  }),
);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/services/cloud-code-agent-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-agent-service')>();
  return { ...actual, requestCloudCodeTurnCancellation: mockRequestCancellation };
});

import { CloudCodeConflictError } from '@/lib/services/cloud-code-session-service';
import { POST } from './route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const TURN_ID = '22222222-2222-4222-8222-222222222222';

function cancelRequest(body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/agent/cancel`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mockRequestCancellation.mockResolvedValue({
    turnId: TURN_ID,
    requestedAt: '2026-09-07T20:00:00.000Z',
  });
});

describe('POST /api/code/sessions/[sessionId]/agent/cancel', () => {
  it('stops the running turn of the session without being told which one', async () => {
    const response = await POST(cancelRequest(), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ turnId: TURN_ID });
    expect(mockRequestCancellation).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      null,
    );
  });

  it('stops the named turn when the caller knows it', async () => {
    await POST(cancelRequest({ turnId: TURN_ID }), context);
    expect(mockRequestCancellation).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      TURN_ID,
    );
  });

  it('refuses a turn identifier that is not one', async () => {
    const response = await POST(cancelRequest({ turnId: '../other-user' }), context);
    expect(response.status).toBe(400);
    expect(mockRequestCancellation).not.toHaveBeenCalled();
  });

  it('refuses without a csrf token', async () => {
    mockCsrf.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(cancelRequest(), context);
    expect(response.status).toBe(403);
    expect(mockRequestCancellation).not.toHaveBeenCalled();
  });

  it('says so when nothing is running', async () => {
    mockRequestCancellation.mockRejectedValue(
      new CloudCodeConflictError('No agent turn is running in this Code session'),
    );
    const response = await POST(cancelRequest(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringMatching(/no agent turn is running/i) },
    });
  });
});
