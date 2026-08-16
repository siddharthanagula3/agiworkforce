
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

describe('voice.ts natural-stop lifecycle', () => {
  beforeEach(async () => {
    await VoiceInput.cancelCapture();
    jest.clearAllMocks();
  });

  it('does not permanently lock out startRecording() after a natural stop', async () => {
    await VoiceService.startRecording();
    expect(VoiceInput.isCapturing()).toBe(true);

    __fireResult({ results: [{ transcript: 'hello there', confidence: 0.9 }], isFinal: false });
    await Promise.resolve();
    __fireEnd();
    await Promise.resolve();
    await Promise.resolve();

    expect(VoiceInput.isCapturing()).toBe(false);

    await expect(VoiceService.startRecording()).resolves.toBeUndefined();
  });

  it('still delivers the transcript when stopRecording() is called after a natural stop', async () => {
    await VoiceService.startRecording();

    __fireResult({
      results: [{ transcript: 'buy milk tomorrow', confidence: 0.95 }],
      isFinal: false,
    });
    await Promise.resolve();
    __fireEnd();
    await Promise.resolve();
    await Promise.resolve();

    await expect(VoiceService.stopRecording()).resolves.toBe('');

    const result = await VoiceService.transcribe('');
    expect(result.text).toBe('buy milk tomorrow');
  });

  it('does not produce an unhandled promise rejection when a recording is cancelled', async () => {
    const unhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      await VoiceService.startRecording();
      await VoiceService.cancelRecording();

      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
      }
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }

    expect(unhandled).toHaveLength(0);
    await expect(VoiceService.startRecording()).resolves.toBeUndefined();
  });
});
