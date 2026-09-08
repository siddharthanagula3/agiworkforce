import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockRateLimit,
  mockCsrf,
  mockRename,
  mockSetArchived,
  mockDelete,
  mockGetSession,
  mockGetSubscription,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockRateLimit: vi.fn(),
  mockCsrf: vi.fn(),
  mockRename: vi.fn(),
  mockSetArchived: vi.fn(),
  mockDelete: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetSubscription: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return {
    ...actual,
    renameCloudCodeSession: mockRename,
    setCloudCodeSessionArchived: mockSetArchived,
    deleteCloudCodeSession: mockDelete,
    getCloudCodeSession: mockGetSession,
  };
});

import { CloudCodeConflictError } from '@/lib/services/cloud-code-session-service';
import { DELETE, PATCH } from './route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

function sessionRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mockRename.mockResolvedValue({ id: SESSION_ID, title: 'Renamed' });
  mockSetArchived.mockResolvedValue({ id: SESSION_ID, archivedAt: '2026-09-07T13:00:00.000Z' });
  mockGetSession.mockResolvedValue({ id: SESSION_ID, title: 'Workspace' });
  mockDelete.mockResolvedValue(undefined);
});

describe('PATCH /api/code/sessions/[sessionId]', () => {
  it('renames on a title', async () => {
    const response = await PATCH(sessionRequest('PATCH', { title: 'Renamed' }), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ session: { title: 'Renamed' } });
    expect(mockRename).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      'Renamed',
    );
    expect(mockSetArchived).not.toHaveBeenCalled();
  });

  it('archives and unarchives on the archived flag', async () => {
    await PATCH(sessionRequest('PATCH', { archived: true }), context);
    expect(mockSetArchived).toHaveBeenLastCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      true,
    );

    await PATCH(sessionRequest('PATCH', { archived: false }), context);
    expect(mockSetArchived).toHaveBeenLastCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      false,
    );
  });

  it('refuses a body that asks for nothing', async () => {
    const response = await PATCH(sessionRequest('PATCH', { unrelated: true }), context);
    expect(response.status).toBe(400);
    expect(mockRename).not.toHaveBeenCalled();
    expect(mockSetArchived).not.toHaveBeenCalled();
  });

  it('refuses an archived flag that is not a boolean', async () => {
    const response = await PATCH(sessionRequest('PATCH', { archived: 'yes' }), context);
    expect(response.status).toBe(400);
    expect(mockSetArchived).not.toHaveBeenCalled();
  });

  it('refuses without a csrf token', async () => {
    mockCsrf.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await PATCH(sessionRequest('PATCH', { title: 'Renamed' }), context);
    expect(response.status).toBe(403);
    expect(mockRename).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/code/sessions/[sessionId]', () => {
  it('hard deletes and says so', async () => {
    const response = await DELETE(sessionRequest('DELETE'), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(mockDelete).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      'pro',
    );
  });

  it('passes the open-session refusal through as a 409', async () => {
    mockDelete.mockRejectedValue(
      new CloudCodeConflictError('Close or archive this Code session before deleting it'),
    );
    const response = await DELETE(sessionRequest('DELETE'), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringMatching(/close or archive/i) },
    });
  });

  it('refuses without a csrf token', async () => {
    mockCsrf.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await DELETE(sessionRequest('DELETE'), context);
    expect(response.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
