import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { canonicalVoiceModel } = vi.hoisted(() => ({
  canonicalVoiceModel: 'catalog-voice-transcription-model',
}));

vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  getRoutingSlotModel: () => canonicalVoiceModel,
}));

vi.mock('../lib/tauri-mock', () => ({
  invoke: vi.fn().mockResolvedValue([]),
  isTauri: false,
  isTauriContext: () => false,
}));

vi.mock('../services/cloudAccountAuth', () => ({
  cloudAccountAuth: {
    getSession: () => ({ access_token: 'test-token' }),
    onAuthStateChange: vi.fn(() => () => {}),
  },
}));

// The voice hook routes its upload through the egress guard. This suite tests
// transcription behaviour, not the guard (which has its own test), so stub the
// guard to a passthrough — this also avoids pulling the appModeStore→auth chain.
vi.mock('../lib/egressGuard', () => ({
  guardedFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
}));

import { useVoiceTranscription } from '../hooks/useVoiceTranscription';

class MockMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(public stream: MediaStream) {}

  start() {
    const blob = new Blob(['audio-bytes'], { type: 'audio/webm' });
    this.ondataavailable?.({ data: blob });
  }

  stop() {
    this.onstop?.();
  }
}

describe('useVoiceTranscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, 'MediaRecorder', {
      value: MockMediaRecorder,
      configurable: true,
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      configurable: true,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'hello world' }),
      }),
    );
  });

  it('uploads recorded audio to cloud transcription endpoint and returns transcript', async () => {
    const onResult = vi.fn();
    const { result } = renderHook(() =>
      useVoiceTranscription({
        preferWhisperCloud: true,
        language: 'en',
        onResult,
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      const text = await result.current.stopRecording();
      expect(text).toBe('hello world');
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/voice/transcribe'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    const [, request] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((request.body as FormData).get('model')).toBe(canonicalVoiceModel);
    expect(onResult).toHaveBeenCalledWith('hello world');
  });
});
