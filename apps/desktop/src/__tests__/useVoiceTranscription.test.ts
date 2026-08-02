import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function createCloudRequestContext() {
  return {
    assertBoundary: vi.fn(),
    fetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)),
  };
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uploads recorded audio to cloud transcription endpoint and returns transcript', async () => {
    const onResult = vi.fn();
    const request = createCloudRequestContext();
    const { result } = renderHook(() =>
      useVoiceTranscription({
        preferWhisperCloud: true,
        language: 'en',
        onResult,
        getCloudRequestContext: () => request,
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      const text = await result.current.stopRecording();
      expect(text).toBe('hello world');
    });

    expect(request.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/voice/transcribe'),
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
    const [, requestInit] = request.fetch.mock.calls[0] as [string, RequestInit];
    expect((requestInit.body as FormData).get('model')).toBe(canonicalVoiceModel);
    expect(new Headers(requestInit.headers).has('Authorization')).toBe(false);
    expect(onResult).toHaveBeenCalledWith('hello world');
  });

  it('uses and revalidates a host-captured Managed Cloud request context', async () => {
    const request = createCloudRequestContext();
    const getCloudRequestContext = vi.fn(() => request);
    const { result } = renderHook(() =>
      useVoiceTranscription({
        preferWhisperCloud: true,
        getCloudRequestContext,
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });
    await act(async () => {
      await result.current.stopRecording();
    });

    expect(getCloudRequestContext).toHaveBeenCalledTimes(1);
    expect(request.assertBoundary.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(request.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/voice/transcribe'),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('can discard a recording without uploading it for transcription', async () => {
    const request = createCloudRequestContext();
    const { result } = renderHook(() =>
      useVoiceTranscription({
        preferWhisperCloud: true,
        getCloudRequestContext: () => request,
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      result.current.cancelRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(request.fetch).not.toHaveBeenCalled();
  });

  it('aborts an in-flight upload and ignores its deferred response when cancelled', async () => {
    let resolveUpload!: (response: Response) => void;
    const upload = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    const request = {
      assertBoundary: vi.fn(),
      fetch: vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => upload),
    };
    const onResult = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceTranscription({
        preferWhisperCloud: true,
        getCloudRequestContext: () => request,
        onResult,
        onError,
      }),
    );

    await act(async () => result.current.startRecording());
    let stopPromise!: Promise<string>;
    act(() => {
      stopPromise = result.current.stopRecording();
    });
    await waitFor(() => expect(request.fetch).toHaveBeenCalledOnce());
    const signal = request.fetch.mock.calls[0]?.[1]?.signal as AbortSignal;

    act(() => result.current.cancelRecording());
    expect(signal.aborted).toBe(true);
    resolveUpload(Response.json({ text: 'stale account transcript' }));
    await expect(stopPromise).resolves.toBe('');
    expect(onResult).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.transcript).toBe('');
  });

  it('aborts an older transcription when a new recording supersedes it', async () => {
    const request = {
      assertBoundary: vi.fn(),
      fetch: vi.fn(
        (_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}),
      ),
    };
    const onResult = vi.fn();
    const { result } = renderHook(() =>
      useVoiceTranscription({
        preferWhisperCloud: true,
        getCloudRequestContext: () => request,
        onResult,
      }),
    );

    await act(async () => result.current.startRecording());
    let firstTranscription!: Promise<string>;
    act(() => {
      firstTranscription = result.current.stopRecording();
    });
    await waitFor(() => expect(request.fetch).toHaveBeenCalledOnce());
    const firstSignal = request.fetch.mock.calls[0]?.[1]?.signal as AbortSignal;

    await act(async () => result.current.startRecording());

    expect(firstSignal.aborted).toBe(true);
    await expect(firstTranscription).resolves.toBe('');
    expect(result.current.isRecording).toBe(true);
    expect(result.current.isTranscribing).toBe(false);
    expect(onResult).not.toHaveBeenCalled();
    act(() => result.current.cancelRecording());
  });

  it('aborts the actual upload when transcription times out', async () => {
    vi.useFakeTimers();
    const request = {
      assertBoundary: vi.fn(),
      fetch: vi.fn(
        (_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}),
      ),
    };
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceTranscription({
        preferWhisperCloud: true,
        getCloudRequestContext: () => request,
        onError,
      }),
    );

    await act(async () => result.current.startRecording());
    let stopPromise!: Promise<string>;
    act(() => {
      stopPromise = result.current.stopRecording();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
      await stopPromise;
    });

    const signal = request.fetch.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toMatchObject({ name: 'TimeoutError' });
    await expect(stopPromise).resolves.toBe('');
    expect(onError).toHaveBeenCalledWith('Request timed out after 15000ms');
  });

  it('aborts an in-flight upload on unmount without publishing an error', async () => {
    const request = {
      assertBoundary: vi.fn(),
      fetch: vi.fn(
        (_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}),
      ),
    };
    const onError = vi.fn();
    const { result, unmount } = renderHook(() =>
      useVoiceTranscription({
        preferWhisperCloud: true,
        getCloudRequestContext: () => request,
        onError,
      }),
    );

    await act(async () => result.current.startRecording());
    let stopPromise!: Promise<string>;
    act(() => {
      stopPromise = result.current.stopRecording();
    });
    await waitFor(() => expect(request.fetch).toHaveBeenCalledOnce());
    const signal = request.fetch.mock.calls[0]?.[1]?.signal as AbortSignal;

    unmount();
    expect(signal.aborted).toBe(true);
    await expect(stopPromise).resolves.toBe('');
    expect(onError).not.toHaveBeenCalled();
  });
});
