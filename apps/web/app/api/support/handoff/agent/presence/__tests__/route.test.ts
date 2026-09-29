import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  upsertAgentPresence: vi.fn(),
  clearAvailabilityCache: vi.fn(),
  resolveHumanAvailability: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/store', () => ({
  upsertAgentPresence: mocks.upsertAgentPresence,
}));
vi.mock('@/lib/support/handoff/presence-service', () => ({
  clearAvailabilityCache: mocks.clearAvailabilityCache,
  resolveHumanAvailability: mocks.resolveHumanAvailability,
}));

import { createError } from '@/lib/errors';
import { GET, POST } from '../route';

const URL_BASE = 'http://localhost/api/support/handoff/agent/presence';
const HEARTBEAT_AT = '2026-09-28T00:00:00.000Z';

function postRequest(body: unknown): NextRequest {
  return new NextRequest(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_SUPPORT_AGENT_HEARTBEAT_TTL_SECONDS', '90');
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'operator_1' });
  mocks.upsertAgentPresence.mockResolvedValue({
    agent_user_id: 'operator_1',
    display_name: 'Sam',
    status: 'online',
    max_concurrent_sessions: 3,
    last_heartbeat_at: HEARTBEAT_AT,
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/support/handoff/agent/presence', () => {
  it('stops at the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(postRequest({ status: 'online', displayName: 'Sam' }));

    expect(response.status).toBe(403);
    expect(mocks.upsertAgentPresence).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await POST(postRequest({ status: 'online', displayName: 'Sam' }));

    expect(response.status).toBe(404);
    expect(mocks.upsertAgentPresence).not.toHaveBeenCalled();
  });

  it('rejects an invalid payload with 400', async () => {
    const response = await POST(postRequest({ status: 'busy', displayName: 'Sam' }));

    expect(response.status).toBe(400);
    expect(mocks.upsertAgentPresence).not.toHaveBeenCalled();
  });

  it('records presence for the operator and warns while live handoff is off', async () => {
    vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', '');

    const response = await POST(postRequest({ status: 'online', displayName: 'Sam' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.upsertAgentPresence).toHaveBeenCalledWith({
      agentUserId: 'operator_1',
      displayName: 'Sam',
      status: 'online',
      maxConcurrentSessions: 3,
    });
    expect(mocks.clearAvailabilityCache).toHaveBeenCalled();
    expect(body.presence).toMatchObject({
      agentUserId: 'operator_1',
      status: 'online',
      lastHeartbeatAt: HEARTBEAT_AT,
      expiresAt: '2026-09-28T00:01:30.000Z',
      heartbeatIntervalMs: 30_000,
    });
    expect(body.warning).toContain('AGI_SUPPORT_LIVE_HANDOFF_ENABLED');
  });

  it('omits the warning when live handoff is on', async () => {
    vi.stubEnv('AGI_SUPPORT_LIVE_HANDOFF_ENABLED', '1');

    const response = await POST(
      postRequest({ status: 'online', displayName: 'Sam', maxConcurrentSessions: 5 }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.warning).toBeUndefined();
    expect(mocks.upsertAgentPresence).toHaveBeenCalledWith(
      expect.objectContaining({ maxConcurrentSessions: 5 }),
    );
  });
});

describe('GET /api/support/handoff/agent/presence', () => {
  it('refuses a caller who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await GET(new NextRequest(URL_BASE));

    expect(response.status).toBe(404);
    expect(mocks.resolveHumanAvailability).not.toHaveBeenCalled();
  });

  it('reads availability uncached for an operator', async () => {
    mocks.resolveHumanAvailability.mockResolvedValue({ live: true, reason: 'live' });

    const response = await GET(new NextRequest(URL_BASE));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.resolveHumanAvailability).toHaveBeenCalledWith({ skipCache: true });
    expect(await response.json()).toEqual({ availability: { live: true, reason: 'live' } });
  });
});
