import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequireCurrentUserId, mockNeonQuery } = vi.hoisted(() => ({
  mockRequireCurrentUserId: vi.fn(),
  mockNeonQuery: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/neon-chat', () => ({
  requireCurrentUserId: mockRequireCurrentUserId,
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
  })),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockNeonQuery(...args) },
    userId: await mockRequireCurrentUserId(),
    organizationId: null,
  })),
}));

import { POST, DELETE } from '../route';
import { getUserScopedDb } from '@/lib/server/rls-db';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';

function makePostRequest(body: unknown) {
  return new Request('http://localhost:3000/api/mobile/push-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

function makeDeleteRequest(deviceId?: string) {
  const url = deviceId
    ? `http://localhost:3000/api/mobile/push-token?deviceId=${deviceId}`
    : 'http://localhost:3000/api/mobile/push-token';
  return new Request(url, { method: 'DELETE' }) as never;
}

describe('POST /api/mobile/push-token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUserId.mockResolvedValue('user-1');
  });

  it('upserts the device row for the current user', async () => {
    mockNeonQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await POST(
      makePostRequest({
        deviceId: DEVICE_ID,
        pushToken: 'ExponentPushToken[abc]',
        platform: 'ios',
      }),
    );

    expect(res.status).toBe(200);
    expect(getUserScopedDb).toHaveBeenCalledWith(expect.any(Request), {
      resolveOrganization: false,
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['success']).toBe(true);
  });

  it('rejects a device already owned by a different user', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ user_id: 'someone-else' }]);

    const res = await POST(
      makePostRequest({ deviceId: DEVICE_ID, pushToken: 'ExponentPushToken[abc]' }),
    );

    expect(res.status).toBe(403);
  });

  it('returns 400 on an invalid payload', async () => {
    const res = await POST(makePostRequest({ deviceId: 'not-a-uuid', pushToken: 'x' }));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/mobile/push-token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUserId.mockResolvedValue('user-1');
  });

  it('clears the push token for the current user’s device', async () => {
    mockNeonQuery.mockResolvedValueOnce([]);

    const res = await DELETE(makeDeleteRequest(DEVICE_ID));

    expect(res.status).toBe(200);
    expect(getUserScopedDb).toHaveBeenCalledWith(expect.any(Request), {
      resolveOrganization: false,
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['success']).toBe(true);

    expect(mockNeonQuery).toHaveBeenCalledWith(expect.stringContaining('set push_token = null'), [
      DEVICE_ID,
      'user-1',
    ]);
  });

  it('returns 400 when deviceId is missing', async () => {
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(400);
  });

  it('returns 400 when deviceId is not a valid UUID', async () => {
    const res = await DELETE(makeDeleteRequest('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('does not throw for a device owned by a different user (fire-and-forget contract)', async () => {
    mockNeonQuery.mockResolvedValueOnce([]);

    const res = await DELETE(makeDeleteRequest(DEVICE_ID));

    expect(res.status).toBe(200);
  });
});
