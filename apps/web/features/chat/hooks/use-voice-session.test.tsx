import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const speak = vi.fn();
const stopSpeaking = vi.fn();

vi.mock('@/lib/hooks/useTTS', () => ({
  useTTS: () => ({
    isSpeaking: false,
    isSupported: true,
    speak,
    stop: stopSpeaking,
    voices: [],
    voiceUri: null,
    setVoiceUri: vi.fn(),
  }),
}));

vi.mock('@features/support/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}));

import { useVoiceSession } from './use-voice-session';
import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';
import { useVoiceSessionStore } from '@features/chat/stores/voice-session-store';
import {
  INITIAL_VOICE_SESSION_STATE,
  UTTERANCE_CANCEL_WINDOW_MS,
  VOICE_SESSION_EVENT,
  VOICE_SESSION_STATUS,
} from '@agiworkforce/unified-chat';

const UTTERANCE = 'book the flight for tuesday';

class StubMediaRecorder {
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onstop?.());
  static isTypeSupported(): boolean {
    return true;
  }
}

function stubMediaRecorder() {
  function RecorderCtor(this: StubMediaRecorder) {
    return new StubMediaRecorder();
  }
  (RecorderCtor as unknown as { isTypeSupported: () => boolean }).isTypeSupported =
    StubMediaRecorder.isTypeSupported;
  Object.defineProperty(window, 'MediaRecorder', {
    value: RecorderCtor,
    writable: true,
    configurable: true,
  });
}

function mount(reply: { id: string; content: string } | null = null) {
  const onSend = vi.fn().mockReturnValue(true);
  const view = renderHook(() => useVoiceSession({ turnActive: false, reply, onSend }));
  return { ...view, onSend };
}

function grantMicrophone(state: PermissionState) {
  Object.defineProperty(navigator, 'permissions', {
    value: { query: vi.fn().mockResolvedValue({ state }) },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi
        .fn()
        .mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream),
      enumerateDevices: vi
        .fn()
        .mockResolvedValue([{ kind: 'audioinput', label: 'Built-in Microphone' }]),
    },
    writable: true,
    configurable: true,
  });
}

async function enterAndTranscribe(result: { current: { enter: () => void } }) {
  await act(async () => {
    result.current.enter();
  });
  await act(async () => {
    useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.speechEnd });
    useVoiceSessionStore
      .getState()
      .dispatch({ type: VOICE_SESSION_EVENT.transcribed, text: UTTERANCE });
  });
}

describe('useVoiceSession', () => {
  beforeEach(() => {
    useVoiceSessionStore.setState({
      session: INITIAL_VOICE_SESSION_STATE,
      focusMode: false,
      dockOpen: false,
      settingsOpen: false,
      activityMessageId: null,
    });
    useVoiceInputStore.setState({
      mode: 'idle',
      transcript: '',
      error: null,
      language: '',
      captureStream: null,
    });
    grantMicrophone('granted');
    stubMediaRecorder();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('listens live when the microphone permission is already granted', async () => {
    const { result } = mount();

    await act(async () => {
      result.current.enter();
    });

    await waitFor(() => expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.listening));
    expect(result.current.state.muted).toBe(false);
  });

  it('starts muted when the permission has not been granted yet', async () => {
    grantMicrophone('prompt');
    const { result } = mount();

    await act(async () => {
      result.current.enter();
    });

    await waitFor(() => expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.muted));
    expect(result.current.mutedHint).toContain('tap the mic');
  });

  it('holds a transcribed utterance for the cancel window before sending it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, onSend } = mount();
    await enterAndTranscribe(result);

    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.sending);
    expect(result.current.state.pendingUtterance).toBe(UTTERANCE);

    await act(async () => {
      vi.advanceTimersByTime(UTTERANCE_CANCEL_WINDOW_MS - 1);
    });
    expect(onSend).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(onSend).toHaveBeenCalledWith(UTTERANCE);
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.streaming);
  });

  it('never sends an utterance cancelled inside the window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, onSend } = mount();
    await enterAndTranscribe(result);

    await act(async () => {
      result.current.cancelPending();
    });
    await act(async () => {
      vi.advanceTimersByTime(UTTERANCE_CANCEL_WINDOW_MS * 2);
    });

    expect(onSend).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.listening);
  });

  it('reports a refused send as an error instead of waiting on a reply', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onSend = vi.fn().mockReturnValue(false);
    const { result } = renderHook(() =>
      useVoiceSession({ turnActive: false, reply: null, onSend }),
    );
    await enterAndTranscribe(result);

    await act(async () => {
      vi.advanceTimersByTime(UTTERANCE_CANCEL_WINDOW_MS);
    });

    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.error);
  });

  it('sends typed text straight through without a cancel window', async () => {
    const { result, onSend } = mount();
    await act(async () => {
      result.current.enter();
    });

    await act(async () => {
      result.current.submitTyped('  what is on my calendar  ');
    });

    expect(onSend).toHaveBeenCalledWith('what is on my calendar');
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.streaming);
  });

  it('speaks a finished reply and stops playback on exit', async () => {
    const onSend = vi.fn().mockReturnValue(true);
    const { result, rerender } = renderHook(
      ({ reply }: { reply: { id: string; content: string } | null }) =>
        useVoiceSession({ turnActive: false, reply, onSend }),
      { initialProps: { reply: null as { id: string; content: string } | null } },
    );
    await act(async () => {
      result.current.enter();
    });
    await act(async () => {
      result.current.submitTyped('when');
    });
    await act(async () => {
      rerender({ reply: { id: 'assistant-1', content: 'Tuesday at nine.' } });
    });

    await waitFor(() => expect(speak).toHaveBeenCalledWith('Tuesday at nine.'));
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.speaking);

    await act(async () => {
      result.current.exit();
    });
    expect(stopSpeaking).toHaveBeenCalled();
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.exited);
  });

  it('mutes and unmutes without leaving the session', async () => {
    const { result } = mount();
    await act(async () => {
      result.current.enter();
    });
    await waitFor(() => expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.listening));

    await act(async () => {
      result.current.toggleMute();
    });
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.muted);

    await act(async () => {
      result.current.toggleMute();
    });
    expect(result.current.state.status).toBe(VOICE_SESSION_STATUS.listening);
  });
});
