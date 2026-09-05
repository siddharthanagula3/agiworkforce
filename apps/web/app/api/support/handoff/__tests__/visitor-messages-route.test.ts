import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  resolveIdentity: vi.fn(),
  getSessionForOwner: vi.fn(),
  appendHandoffMessage: vi.fn(),
  listHandoffMessages: vi.fn(),
  requireHumanCaller: vi.fn(),
}));

vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/request-identity', () => ({
  resolveHandoffIdentity: mocks.resolveIdentity,
}));
vi.mock('@/lib/support/handoff/store', () => ({
  getSessionForOwner: mocks.getSessionForOwner,
  appendHandoffMessage: mocks.appendHandoffMessage,
  listHandoffMessages: mocks.listHandoffMessages,
}));
vi.mock('@/lib/security/bot-challenge', () => ({
  requireHumanCaller: mocks.requireHumanCaller,
}));

import { createError } from '@/lib/errors';
import { BOT_CHALLENGED_ENDPOINTS } from '@/lib/security/bot-challenge-routes';
import { POST } from '../[sessionId]/messages/route';

const SESSION_ID = 'session-1';
const MESSAGE_BODY = 'My invoice still shows the old plan';

function request(body: unknown) {
  return new Request(`http://localhost:3000/api/support/handoff/${SESSION_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

const context = { params: Promise.resolve({ sessionId: SESSION_ID }) } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requireHumanCaller.mockResolvedValue(undefined);
  mocks.resolveIdentity.mockResolvedValue({ userId: null, ownerSessionKey: 'anon-owner' });
  mocks.getSessionForOwner.mockResolvedValue({ id: SESSION_ID, status: 'connected' });
  mocks.appendHandoffMessage.mockResolvedValue({
    seq: 4,
    author: 'user',
    body: MESSAGE_BODY,
    created_at: '2026-09-03T00:00:00.000Z',
  });
});

describe('POST /api/support/handoff/[sessionId]/messages', () => {
  it('appends a visitor message on the existing path', async () => {
    const response = await POST(request({ body: MESSAGE_BODY }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: { seq: 4, author: 'user', body: MESSAGE_BODY, at: '2026-09-03T00:00:00.000Z' },
    });
    expect(mocks.appendHandoffMessage).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      author: 'user',
      body: MESSAGE_BODY,
    });
  });

  it('challenges the caller before touching the session store', async () => {
    mocks.requireHumanCaller.mockRejectedValue(createError.forbidden());

    const response = await POST(request({ body: MESSAGE_BODY }), context);

    expect(response.status).toBe(403);
    expect(mocks.requireHumanCaller).toHaveBeenCalledWith(
      BOT_CHALLENGED_ENDPOINTS.supportHandoffMessage,
    );
    expect(mocks.getSessionForOwner).not.toHaveBeenCalled();
    expect(mocks.appendHandoffMessage).not.toHaveBeenCalled();
  });

  it('keeps the rate limit ahead of the bot challenge', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response('slow down', { status: 429 }) as never);

    const response = await POST(request({ body: MESSAGE_BODY }), context);

    expect(response.status).toBe(429);
    expect(mocks.requireHumanCaller).not.toHaveBeenCalled();
  });
});
