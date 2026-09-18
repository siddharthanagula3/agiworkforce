import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authUserMock,
  csrfMock,
  rateLimitMock,
  userScopedDbMock,
  isLiveVoiceMock,
  updateVoiceSessionSettingsMock,
  isVoiceSessionStoreReadyMock,
} = vi.hoisted(() => ({
  authUserMock: vi.fn(),
  csrfMock: vi.fn(),
  rateLimitMock: vi.fn(),
  userScopedDbMock: vi.fn(),
  isLiveVoiceMock: vi.fn(),
  updateVoiceSessionSettingsMock: vi.fn(),
  isVoiceSessionStoreReadyMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: authUserMock }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: userScopedDbMock }));
vi.mock('@features/chat/lib/live-voices', () => ({ isLiveVoice: isLiveVoiceMock }));
vi.mock('../../../lib/voice-session-store', () => ({
  updateVoiceSessionSettings: updateVoiceSessionSettingsMock,
  isVoiceSessionStoreReady: isVoiceSessionStoreReadyMock,
  VOICE_PACE_MIN: 0.25,
  VOICE_PACE_MAX: 4,
}));

import { NextRequest } from 'next/server';
import { PATCH } from '../route';

const SESSION_ID = 'live_1';

function patch(body: unknown): NextRequest {
  return new NextRequest(
    `https://agiworkforce.com/api/voice/live/sessions/${SESSION_ID}/settings`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

function params() {
  return { params: Promise.resolve({ sessionId: SESSION_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  authUserMock.mockResolvedValue({ userId: 'user-1' });
  csrfMock.mockResolvedValue(null);
  rateLimitMock.mockResolvedValue(null);
  userScopedDbMock.mockResolvedValue({
    db: { query: vi.fn() },
    userId: 'user-1',
    organizationId: null,
  });
  isLiveVoiceMock.mockReturnValue(true);
  isVoiceSessionStoreReadyMock.mockResolvedValue(true);
});

describe('PATCH /api/voice/live/sessions/[sessionId]/settings', () => {
  it('updates the voice, language and pace and returns the record', async () => {
    updateVoiceSessionSettingsMock.mockResolvedValue({
      providerSessionId: SESSION_ID,
      voice: 'quartz',
      language: 'es',
      pace: 1.25,
      lastTurnId: 'turn-1',
    });
    const response = await PATCH(patch({ voice: 'quartz', language: 'es', pace: 1.25 }), params());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      sessionId: SESSION_ID,
      voice: 'quartz',
      language: 'es',
      pace: 1.25,
      lastTurnId: 'turn-1',
    });
    expect(updateVoiceSessionSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        providerSessionId: SESSION_ID,
        voice: 'quartz',
        language: 'es',
        pace: 1.25,
      }),
    );
  });

  it('rejects an empty body with 400 and never updates', async () => {
    const response = await PATCH(patch({}), params());
    expect(response.status).toBe(400);
    expect(updateVoiceSessionSettingsMock).not.toHaveBeenCalled();
  });

  it('rejects a voice the deployment does not offer', async () => {
    isLiveVoiceMock.mockReturnValue(false);
    const response = await PATCH(patch({ voice: 'not-a-voice' }), params());
    expect(response.status).toBe(400);
    expect(updateVoiceSessionSettingsMock).not.toHaveBeenCalled();
  });

  it('404s when no open session matches', async () => {
    updateVoiceSessionSettingsMock.mockResolvedValue(null);
    const response = await PATCH(patch({ pace: 1 }), params());
    expect(response.status).toBe(404);
  });

  it('503s when the voice session store is not ready', async () => {
    isVoiceSessionStoreReadyMock.mockResolvedValue(false);
    const response = await PATCH(patch({ pace: 1 }), params());
    expect(response.status).toBe(503);
    expect(updateVoiceSessionSettingsMock).not.toHaveBeenCalled();
  });

  it('returns the csrf response and never updates when the token is missing', async () => {
    csrfMock.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await PATCH(patch({ pace: 1 }), params());
    expect(response.status).toBe(403);
    expect(updateVoiceSessionSettingsMock).not.toHaveBeenCalled();
  });
});
