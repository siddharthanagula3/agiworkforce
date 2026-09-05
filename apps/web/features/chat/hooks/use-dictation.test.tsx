import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  getRoutingSlotModel: () => 'catalog-voice-transcription-model',
}));

import { useDictation } from './use-dictation';
import { clearCsrfToken } from '@/lib/client/csrf';
import { useVoiceInputStore, _resetRuntimeRefs } from '@features/chat/stores/voice-input-store';
import { DICTATION_STATUS } from '@features/chat/lib/dictation-machine';

const TRANSCRIPT = 'ship the dictation bar';

class MockMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start = vi.fn(() => {
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
  });
  stop = vi.fn(() => {
    this.onstop?.();
  });

  static isTypeSupported(): boolean {
    return true;
  }
}

let currentRecorder: MockMediaRecorder;

function RecorderCtor(this: MockMediaRecorder) {
  return currentRecorder;
}
(RecorderCtor as unknown as { isTypeSupported: () => boolean }).isTypeSupported =
  MockMediaRecorder.isTypeSupported;

function grantMicrophone() {
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    writable: true,
    configurable: true,
  });
  return stream;
}

function denyMicrophone() {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
    },
    writable: true,
    configurable: true,
  });
}

const CSRF_ENDPOINT = '/api/csrf';

function stubFetch(transcribe: () => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === CSRF_ENDPOINT) {
        return {
          ok: true,
          json: async () => ({ token: 'csrf-token-fixture', expiresIn: 3_600_000 }),
        };
      }
      return transcribe();
    }),
  );
}

function transcribes(text: string) {
  stubFetch(() => ({ ok: true, json: async () => ({ text }), text: async () => '' }));
}

function mount() {
  const onInsert = vi.fn();
  const onSend = vi.fn();
  const view = renderHook(() => useDictation({ onInsert, onSend }));
  return { ...view, onInsert, onSend };
}

describe('useDictation', () => {
  beforeEach(() => {
    _resetRuntimeRefs();
    clearCsrfToken();
    useVoiceInputStore.setState({
      mode: 'idle',
      transcript: '',
      error: null,
      language: 'en-US',
      captureStream: null,
    });
    currentRecorder = new MockMediaRecorder();
    Object.defineProperty(window, 'MediaRecorder', {
      value: RecorderCtor,
      writable: true,
      configurable: true,
    });
    grantMicrophone();
    transcribes(TRANSCRIPT);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('is idle and inactive before the microphone is pressed', () => {
    const { result } = mount();
    expect(result.current.status).toBe(DICTATION_STATUS.idle);
    expect(result.current.isActive).toBe(false);
  });

  it('records once capture starts and announces it', async () => {
    const { result } = mount();

    await act(async () => {
      result.current.start();
    });

    expect(result.current.status).toBe(DICTATION_STATUS.recording);
    expect(result.current.isActive).toBe(true);
    expect(result.current.announcement).toContain('Recording started');
    expect(useVoiceInputStore.getState().captureStream).not.toBeNull();
  });

  it('hands the transcript to the field on stop and returns to idle', async () => {
    const { result, onInsert, onSend } = mount();

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(onInsert).toHaveBeenCalledWith(TRANSCRIPT));
    expect(onSend).not.toHaveBeenCalled();
    expect(result.current.status).toBe(DICTATION_STATUS.idle);
  });

  it('hands the transcript to the send path on send', async () => {
    const { result, onInsert, onSend } = mount();

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.send();
    });

    await waitFor(() => expect(onSend).toHaveBeenCalledWith(TRANSCRIPT));
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('surfaces a denied microphone as an inline error', async () => {
    denyMicrophone();
    const { result } = mount();

    await act(async () => {
      result.current.start();
    });

    await waitFor(() => expect(result.current.status).toBe(DICTATION_STATUS.error));
    expect(result.current.error).toContain('denied');
    expect(result.current.isActive).toBe(true);
  });

  it('surfaces a transcription failure as an inline error and keeps nothing', async () => {
    const { result, onInsert } = mount();

    await act(async () => {
      result.current.start();
    });
    stubFetch(() => ({ ok: false, status: 500 }));
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(result.current.status).toBe(DICTATION_STATUS.error));
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('reports an empty transcript rather than inserting nothing', async () => {
    const { result, onInsert } = mount();

    await act(async () => {
      result.current.start();
    });
    transcribes('   ');
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(result.current.status).toBe(DICTATION_STATUS.error));
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('cancels without delivering anything and releases the microphone', async () => {
    const { result, onInsert, onSend } = mount();

    await act(async () => {
      result.current.start();
    });
    act(() => {
      result.current.cancel();
    });

    expect(result.current.status).toBe(DICTATION_STATUS.cancelled);
    expect(result.current.isActive).toBe(false);
    expect(onInsert).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(useVoiceInputStore.getState().captureStream).toBeNull();
    expect(result.current.announcement).toContain('discarded');
  });

  it('restarts capture from the error state on retry', async () => {
    denyMicrophone();
    const { result } = mount();

    await act(async () => {
      result.current.start();
    });
    await waitFor(() => expect(result.current.status).toBe(DICTATION_STATUS.error));

    grantMicrophone();
    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe(DICTATION_STATUS.recording));
    expect(result.current.error).toBeNull();
  });

  it('ignores a transcript that lands after the run was cancelled', async () => {
    const { result, onInsert } = mount();

    await act(async () => {
      result.current.start();
    });
    act(() => {
      result.current.stop();
      result.current.cancel();
    });

    await waitFor(() => expect(result.current.status).toBe(DICTATION_STATUS.cancelled));
    expect(onInsert).not.toHaveBeenCalled();
  });
});
