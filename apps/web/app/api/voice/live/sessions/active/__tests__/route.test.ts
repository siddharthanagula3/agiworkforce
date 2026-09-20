import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authUserMock,
  rateLimitMock,
  userScopedDbMock,
  closeExpiredVoiceSessionsMock,
  getActiveVoiceSessionForConversationMock,
  isVoiceSessionStoreReadyMock,
  listVoiceSessionHistoryMock,
} = vi.hoisted(() => ({
  authUserMock: vi.fn(),
  rateLimitMock: vi.fn(),
  userScopedDbMock: vi.fn(),
  closeExpiredVoiceSessionsMock: vi.fn(),
  getActiveVoiceSessionForConversationMock: vi.fn(),
  isVoiceSessionStoreReadyMock: vi.fn(),
  listVoiceSessionHistoryMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: authUserMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: userScopedDbMock }));
vi.mock('../../lib/voice-session-store', () => ({
  closeExpiredVoiceSessions: closeExpiredVoiceSessionsMock,
  getActiveVoiceSessionForConversation: getActiveVoiceSessionForConversationMock,
  isVoiceSessionStoreReady: isVoiceSessionStoreReadyMock,
  listVoiceSessionHistory: listVoiceSessionHistoryMock,
}));

import { NextRequest } from 'next/server';
import { LIVE_SESSION_BLOCK_MINUTES } from '@/lib/voice/live-voice-billing';
import { GET } from '../route';

const SESSION = {
  providerSessionId: 'live_1',
  conversationId: 'conv-1',
  surface: 'web',
  voice: 'marin',
  language: null,
  pace: 1,
  activeTools: ['web_search'],
  lastTurnId: 'turn-1',
  startedAt: '2026-09-03T00:00:00.000Z',
};

function get(search = ''): NextRequest {
  return new NextRequest(`https://agiworkforce.com/api/voice/live/sessions/active${search}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  authUserMock.mockResolvedValue({ userId: 'user-1' });
  rateLimitMock.mockResolvedValue(null);
  userScopedDbMock.mockResolvedValue({
    db: { query: vi.fn() },
    userId: 'user-1',
    organizationId: null,
  });
  isVoiceSessionStoreReadyMock.mockResolvedValue(true);
  closeExpiredVoiceSessionsMock.mockResolvedValue(0);
  getActiveVoiceSessionForConversationMock.mockResolvedValue(null);
  listVoiceSessionHistoryMock.mockResolvedValue([]);
});

describe('GET /api/voice/live/sessions/active', () => {
  it('reports the active session for the given conversation', async () => {
    getActiveVoiceSessionForConversationMock.mockResolvedValue(SESSION);
    const response = await GET(get('?conversationId=conv-1'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session).toEqual({
      sessionId: 'live_1',
      conversationId: 'conv-1',
      surface: 'web',
      voice: 'marin',
      language: null,
      pace: 1,
      activeTools: ['web_search'],
      lastTurnId: 'turn-1',
      startedAt: '2026-09-03T00:00:00.000Z',
    });
    expect(getActiveVoiceSessionForConversationMock).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'conv-1',
    );
  });

  it('answers with no session and no history when neither is requested', async () => {
    const response = await GET(get());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ session: null, history: [] });
    expect(getActiveVoiceSessionForConversationMock).not.toHaveBeenCalled();
    expect(listVoiceSessionHistoryMock).not.toHaveBeenCalled();
  });

  it('includes history when asked', async () => {
    listVoiceSessionHistoryMock.mockResolvedValue([
      { ...SESSION, status: 'closed', closedAt: null, closeReason: null },
    ]);
    const response = await GET(get('?history=true'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.history).toHaveLength(1);
    expect(body.history[0].sessionId).toBe('live_1');
  });

  it('answers with an empty session and history when the store is not ready', async () => {
    isVoiceSessionStoreReadyMock.mockResolvedValue(false);
    const response = await GET(get('?conversationId=conv-1&history=true'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ session: null, history: [] });
    expect(getActiveVoiceSessionForConversationMock).not.toHaveBeenCalled();
  });

  it('ends a session left open past its block before it can be offered as resumable', async () => {
    await GET(get('?conversationId=conv-1'));
    expect(closeExpiredVoiceSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        maxOpenSeconds: LIVE_SESSION_BLOCK_MINUTES * 60,
      }),
    );
    const expiryCall = closeExpiredVoiceSessionsMock.mock.invocationCallOrder[0] ?? 0;
    const readCall = getActiveVoiceSessionForConversationMock.mock.invocationCallOrder[0] ?? 0;
    expect(expiryCall).toBeLessThan(readCall);
  });

  it('returns the limiter response and never reads when rate limited', async () => {
    rateLimitMock.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await GET(get('?conversationId=conv-1'));
    expect(response.status).toBe(429);
    expect(getActiveVoiceSessionForConversationMock).not.toHaveBeenCalled();
  });
});
