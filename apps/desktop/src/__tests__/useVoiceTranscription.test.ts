import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/tauri-mock', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/supabaseAuth', () => ({
  supabaseAuth: {
    getSession: () => ({ access_token: 'test-token' }),
  },
}));

import { useVoiceTranscription } from '../hooks/useVoiceTranscription';

class MockMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  mimeType = 'audio/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(public stream: MediaStream) {}

  start() {
    const blob = new Blob(['audio-bytes'], { type: 'audio/webm' });
    this.ondataavailable?.({ data: blob } as BlobEvent);
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
        preferLocal: true,
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
    expect(onResult).toHaveBeenCalledWith('hello world');
  });
});
