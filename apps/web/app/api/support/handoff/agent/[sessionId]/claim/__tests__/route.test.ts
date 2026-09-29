import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  claimHandoffForAgent: vi.fn(),
  getSessionById: vi.fn(),
  appendHandoffMessage: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/handoff-service', () => ({
  claimHandoffForAgent: mocks.claimHandoffForAgent,
}));
vi.mock('@/lib/support/handoff/store', () => ({
  getSessionById: mocks.getSessionById,
  appendHandoffMessage: mocks.appendHandoffMessage,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const SESSION_ID = 'session-1';
const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

function request(): NextRequest {
  return new NextRequest(`http://localhost/api/support/handoff/agent/${SESSION_ID}/claim`, {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'operator_1' });
});

describe('POST /api/support/handoff/agent/[sessionId]/claim', () => {
  it('refuses a caller who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await POST(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.claimHandoffForAgent).not.toHaveBeenCalled();
  });

  it('stops at the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
  });

  it('answers 404 for a session that does not exist', async () => {
    mocks.claimHandoffForAgent.mockResolvedValue(null);
    mocks.getSessionById.mockResolvedValue(null);

    const response = await POST(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('answers 409 for a session another agent already holds', async () => {
    mocks.claimHandoffForAgent.mockResolvedValue(null);
    mocks.getSessionById.mockResolvedValue({ id: SESSION_ID, status: 'connected' });

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain('already connected');
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('claims for the operator and posts the join notice', async () => {
    const claim = { sessionId: SESSION_ID, status: 'connected', transcript: [] };
    mocks.claimHandoffForAgent.mockResolvedValue(claim);

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(claim);
    expect(mocks.claimHandoffForAgent).toHaveBeenCalledWith(SESSION_ID, 'operator_1');
    expect(mocks.appendHandoffMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, author: 'system' }),
    );
  });
});
