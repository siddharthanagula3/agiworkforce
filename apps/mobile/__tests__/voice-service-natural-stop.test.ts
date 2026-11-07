jest.mock('expo-speech-recognition', () => {
  const listenersByEvent: Record<string, Array<(...args: unknown[]) => void>> = {};
  const getListeners = (name: string) => (listenersByEvent[name] ||= []);
  return {
    __esModule: true,
    ExpoSpeechRecognitionModule: {
      start: jest.fn(),
      stop: jest.fn(() => {
        for (const fn of getListeners('end')) fn(null);
      }),
      abort: jest.fn(() => {
        for (const fn of getListeners('end')) fn(null);
      }),
      requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      supportsOnDeviceRecognition: jest.fn().mockReturnValue(true),
      isRecognitionAvailable: jest.fn().mockReturnValue(true),
      addListener: jest.fn((name: string, fn: (...args: unknown[]) => void) => {
        getListeners(name).push(fn);
        return {
          remove: () => {
            listenersByEvent[name] = getListeners(name).filter((cb) => cb !== fn);
          },
        };
      }),
    },
    __fireResult: (event: unknown) => {
      for (const fn of getListeners('result')) fn(event);
    },
    __fireEnd: () => {
      for (const fn of getListeners('end')) fn(null);
    },
  };
});

jest.mock('expo-localization', () => ({
  __esModule: true,
  getLocales: jest.fn().mockReturnValue([{ languageTag: 'en-US' }]),
}));

import * as VoiceService from '@/src/features/voice/services/voice';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';

const { __fireResult, __fireEnd } = jest.requireMock('expo-speech-recognition') as {
  __fireResult: (event: unknown) => void;
  __fireEnd: () => void;
};

describe('voice.ts owned recording lifecycle', () => {
  beforeEach(async () => {
    await VoiceInput.cancelCapture();
    jest.clearAllMocks();
  });

  it('keeps a native final result on its original handle while a newer capture runs', async () => {
    const original = await VoiceService.startRecording();
    __fireResult({
      results: [{ transcript: 'buy milk tomorrow', confidence: 0.95 }],
      isFinal: true,
    });
    const newer = await VoiceService.startRecording();
    await original.stop();
    await original.cancel();
    expect(VoiceInput.isCapturing()).toBe(true);
    await expect(original.result).resolves.toMatchObject({ text: 'buy milk tomorrow' });
    __fireResult({ results: [{ transcript: 'new request', confidence: 0.9 }], isFinal: true });
    await expect(newer.result).resolves.toMatchObject({ text: 'new request' });
  });

  it('delivers a natural end through its owned result', async () => {
    const recording = await VoiceService.startRecording();
    __fireResult({ results: [{ transcript: 'hello there', confidence: 0.9 }], isFinal: false });
    __fireEnd();
    await recording.stop();
    await expect(recording.result).resolves.toMatchObject({ text: 'hello there' });
  });

  it('invalidates pending permission without disturbing a newer capture', async () => {
    const native = jest.requireMock('expo-speech-recognition').ExpoSpeechRecognitionModule;
    let grant!: (value: { granted: boolean }) => void;
    native.requestPermissionsAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = VoiceService.startRecording(undefined, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'aborted' });
    controller.abort();
    const newer = await VoiceService.startRecording();
    grant({ granted: true });
    await rejected;
    expect(native.start).toHaveBeenCalledTimes(1);
    expect(VoiceInput.isCapturing()).toBe(true);
    __fireResult({ results: [{ transcript: 'current', confidence: 1 }], isFinal: true });
    await expect(newer.result).resolves.toMatchObject({ text: 'current' });
  });

  it('does not let cancelled file recognition clear a newer microphone capture', async () => {
    const native = jest.requireMock('expo-speech-recognition').ExpoSpeechRecognitionModule;
    const originalLocales = native.getSupportedLocales;
    let finishLocales!: (value: { installedLocales: string[] }) => void;
    native.getSupportedLocales = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishLocales = resolve;
          }),
      )
      .mockResolvedValue({ installedLocales: ['en-US'] });
    try {
      const pending = VoiceInput.transcribeAudioFile('file:///owned-recording.m4a');
      const rejected = expect(pending).rejects.toMatchObject({ code: 'aborted' });
      await VoiceInput.cancelCapture();
      const newer = await VoiceService.startRecording();
      finishLocales({ installedLocales: ['en-US'] });
      await rejected;
      expect(native.start).toHaveBeenCalledTimes(1);
      expect(native.start.mock.calls[0][0].audioSource).toBeUndefined();
      expect(VoiceInput.isCapturing()).toBe(true);
      await newer.cancel();
    } finally {
      native.getSupportedLocales = originalLocales;
    }
  });

  it('bounds manual stop when the native recognizer emits no end', async () => {
    jest.useFakeTimers();
    try {
      const native = jest.requireMock('expo-speech-recognition').ExpoSpeechRecognitionModule;
      native.stop.mockImplementationOnce(() => undefined);
      const recording = await VoiceService.startRecording();
      __fireResult({ results: [{ transcript: 'kept partial', confidence: 0.7 }], isFinal: false });
      await recording.stop();
      jest.advanceTimersByTime(1500);
      await expect(recording.result).resolves.toMatchObject({ text: 'kept partial' });
      expect(VoiceInput.isCapturing()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels an owned capture without leaving an unhandled rejection', async () => {
    const recording = await VoiceService.startRecording();
    await recording.cancel();
    await expect(recording.result).rejects.toMatchObject({ code: 'aborted' });
    expect(VoiceInput.isCapturing()).toBe(false);
    const newer = await VoiceService.startRecording();
    await newer.cancel();
  });
});
