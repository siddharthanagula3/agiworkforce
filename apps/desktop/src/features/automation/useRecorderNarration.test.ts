import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  voiceCheckLocalWhisper: vi.fn(),
  voiceTranscribeBlob: vi.fn(),
  automationRecordActionNarration: vi.fn(),
  trackStop: vi.fn(),
}));

vi.mock('@agiworkforce/desktop-command-client', () => ({
  automation: {
    automationRecordActionNarration: mocks.automationRecordActionNarration,
  },
  voice: {
    voiceCheckLocalWhisper: mocks.voiceCheckLocalWhisper,
    voiceTranscribeBlob: mocks.voiceTranscribeBlob,
  },
}));

import { useRecorderNarration } from './useRecorderNarration';

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state: RecordingState = 'inactive';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    public readonly stream: MediaStream,
    public readonly options?: MediaRecorderOptions,
  ) {}

  start() {
    this.state = 'recording';
  }

  stop() {
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent);
    this.state = 'inactive';
    this.onstop?.();
  }
}

describe('useRecorderNarration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.voiceCheckLocalWhisper.mockResolvedValue(true);
    mocks.voiceTranscribeBlob.mockResolvedValue({
      text: 'Open the regional report',
      confidence: 0.94,
    });
    mocks.automationRecordActionNarration.mockResolvedValue(undefined);
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal(
      'AudioContext',
      class {
        createMediaStreamSource() {
          return { connect: vi.fn() };
        }
        createAnalyser() {
          return {
            fftSize: 0,
            smoothingTimeConstant: 0,
            frequencyBinCount: 16,
            getByteFrequencyData: vi.fn(),
          };
        }
        close = vi.fn(async () => undefined);
      },
    );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: mocks.trackStop }],
        })),
      },
    });
    if (!Blob.prototype.arrayBuffer) {
      Object.defineProperty(Blob.prototype, 'arrayBuffer', {
        configurable: true,
        value: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
      });
    }
  });

  it('keeps narration off by default, then transcribes locally into the recording', async () => {
    const { result } = renderHook(() => useRecorderNarration());
    await waitFor(() => expect(result.current.isAvailable).toBe(true));
    expect(result.current.phase).toBe('off');

    await act(async () => result.current.startNarration());
    expect(result.current.phase).toBe('listening');

    await act(async () => result.current.stopNarration());

    expect(mocks.voiceTranscribeBlob).toHaveBeenCalledWith(
      expect.any(Array),
      'webm',
      'local_whisper',
      'en',
    );
    expect(mocks.automationRecordActionNarration).toHaveBeenCalledWith('Open the regional report');
    expect(mocks.trackStop).toHaveBeenCalled();
    expect(result.current.phase).toBe('off');
  });

  it('does not request the microphone when local transcription is unavailable', async () => {
    mocks.voiceCheckLocalWhisper.mockResolvedValue(false);
    const { result } = renderHook(() => useRecorderNarration());
    await waitFor(() => expect(result.current.isAvailable).toBe(false));

    await act(async () => result.current.startNarration());

    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/local Whisper/i);
    expect(result.current.phase).toBe('off');
  });
});
