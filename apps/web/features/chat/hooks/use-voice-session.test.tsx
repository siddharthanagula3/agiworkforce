import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const live = vi.hoisted(() => ({
  start: vi.fn(),
  setMuted: vi.fn(),
  close: vi.fn(),
}));

vi.mock('@features/chat/lib/live-voice-session', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, LiveVoiceSession: { start: live.start } };
});
vi.mock('@features/support/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}));
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));

import { endLiveVoiceSession, useVoiceSession } from './use-voice-session';
import { useVoiceSessionStore } from '@features/chat/stores/voice-session-store';
import {
  LIVE_SESSION_MESSAGE,
  LiveVoiceSessionError,
  type LiveVoiceSessionCallbacks,
  type LiveVoiceSessionOptions,
} from '@features/chat/lib/live-voice-session';
import { INITIAL_VOICE_SESSION_STATE, VOICE_SESSION_STATUS } from '@agiworkforce/unified-chat';

const SETTLEMENT = {
  idempotencyKey: 'key',
  leaseToken: 'lease',
  requestHash: 'hash',
  estimatedCostCents: 50,
  ceilingSeconds: 600,
};

function fakeSession() {
  return {
    sessionId: 'live_1',
    settlement: SETTLEMENT,
    microphoneLabel: 'Built-in Microphone',
    lastUsageSeconds: 12,
    setMuted: live.setMuted,
    close: live.close,
    dispose: vi.fn(),
  };
}

function lastCallbacks(): LiveVoiceSessionCallbacks {
  const options = live.start.mock.calls.at(-1)?.[0] as LiveVoiceSessionOptions | undefined;
  if (!options) throw new Error('start was not called');
  return options.callbacks;
}

function mount() {
  const onSend = vi.fn().mockReturnValue(true);
  const onEnsureConversation = vi.fn(async () => 'conv-1');
  const onTranscript = vi.fn();
  const view = renderHook(() =>
    useVoiceSession({
      turnActive: false,
      conversationId: null,
      onSend,
      onEnsureConversation,
      onTranscript,
    }),
  );
  return { ...view, onSend, onEnsureConversation, onTranscript };
}

async function enterAndStart(result: { current: { enter: () => void } }) {
  await act(async () => {
    result.current.enter();
  });
  await waitFor(() => expect(live.start).toHaveBeenCalledTimes(1));
  await act(async () => {
    lastCallbacks().onStarted();
  });
}

describe('useVoiceSession', () => {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

  beforeEach(() => {
    useVoiceSessionStore.setState({
      session: INITIAL_VOICE_SESSION_STATE,
      backendBusy: false,
      voice: 'marin',
    });
    live.start.mockReset();
    live.setMuted.mockReset();
    live.close.mockReset();
    live.start.mockResolvedValue(fakeSession());
    live.close.mockResolvedValue({ reason: 'close_requested', seconds: 30 });
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
  });

  afterEach(async () => {
    cleanup();
    endLiveVoiceSession('test');
    await new Promise((resolve) => setTimeout(resolve, 1));
    vi.unstubAllGlobals();
  });

  it('opens a live session on enter and listens only once the session has started', async () => {
    const { result } = mount();
    await act(async () => {
      result.current.enter();
    });
    await waitFor(() => expect(live.start).toHaveBeenCalledTimes(1));
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.entering);
    expect(live.start.mock.calls[0]?.[0]).toMatchObject({ voice: 'marin', conversationId: null });

    await act(async () => {
      lastCallbacks().onStarted();
    });
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.listening);
    await waitFor(() => expect(result.current.deviceName).toBe('Built-in Microphone'));
  });

  it('mirrors incoming assistant audio and backend work without leaving the session', async () => {
    const { result } = mount();
    await enterAndStart(result);

    await act(async () => {
      lastCallbacks().onSpeaking(true);
    });
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.speaking);
    await act(async () => {
      lastCallbacks().onBackendBusy(true);
      lastCallbacks().onSpeaking(false);
    });
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.listening);
    expect(result.current.backendBusy).toBe(true);
    await act(async () => {
      lastCallbacks().onBackendBusy(false);
    });
    expect(result.current.backendBusy).toBe(false);
  });

  it('mutes through the session and keeps the session alive', async () => {
    const { result } = mount();
    await enterAndStart(result);
    await act(async () => {
      result.current.toggleMute();
    });
    expect(live.setMuted).toHaveBeenLastCalledWith(true);
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.muted);
    await act(async () => {
      result.current.toggleMute();
    });
    expect(live.setMuted).toHaveBeenLastCalledWith(false);
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.listening);
    expect(live.close).not.toHaveBeenCalled();
  });

  it('delivers transcripts into the conversation it ensured once', async () => {
    const { result, onEnsureConversation, onTranscript } = mount();
    await enterAndStart(result);
    await act(async () => {
      lastCallbacks().onTranscript({ turnId: 't1', role: 'user', text: 'hi', final: false });
      lastCallbacks().onTranscript({ turnId: 't1', role: 'user', text: 'hi there', final: true });
    });
    await waitFor(() => expect(onTranscript).toHaveBeenCalledTimes(2));
    expect(onEnsureConversation).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenLastCalledWith('conv-1', {
      turnId: 't1',
      role: 'user',
      text: 'hi there',
      final: true,
    });
  });

  it('closes the session gracefully on exit and settles its usage', async () => {
    const { result } = mount();
    await enterAndStart(result);
    await act(async () => {
      result.current.exit();
    });
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.exited);
    await waitFor(() => expect(live.close).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/voice/live/sessions/live_1/close');
    expect(JSON.parse(String(init.body))).toEqual({
      seconds: 30,
      reason: 'close_requested',
      settlement: SETTLEMENT,
    });
  });

  it('shows the permission failure and reconnects on retry', async () => {
    live.start.mockRejectedValueOnce(
      new LiveVoiceSessionError(LIVE_SESSION_MESSAGE.microphoneDenied, 'microphone_denied'),
    );
    const { result } = mount();
    await act(async () => {
      result.current.enter();
    });
    await waitFor(() => expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.error));
    expect(result.current.state.error).toBe(LIVE_SESSION_MESSAGE.microphoneDenied);

    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(live.start).toHaveBeenCalledTimes(2));
  });

  it('reports a session the provider ended as an error the user can retry', async () => {
    const { result } = mount();
    await enterAndStart(result);
    await act(async () => {
      lastCallbacks().onClosed({ reason: 'expired', seconds: 600 });
    });
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.error);
    expect(result.current.state.error).toBe(LIVE_SESSION_MESSAGE.sessionEnded);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
