jest.mock('expo-speech-recognition', () => {
  const listenersByEvent: Record<string, Array<(ev: unknown) => void>> = {};
  const getListeners = (name: string) => (listenersByEvent[name] ||= []);
  return {
    __esModule: true,
    ExpoSpeechRecognitionModule: {
      start: jest.fn(),
      stop: jest.fn(),
      abort: jest.fn(),
      requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      supportsOnDeviceRecognition: jest.fn().mockReturnValue(true),
      getSupportedLocales: jest
        .fn()
        .mockResolvedValue({ locales: ['en-US', 'fr-FR'], installedLocales: ['en-US'] }),
      addListener: jest.fn((name: string, fn: (ev: unknown) => void) => {
        getListeners(name).push(fn);
        return {
          remove: () => {
            listenersByEvent[name] = getListeners(name).filter((cb) => cb !== fn);
          },
        };
      }),
    },
    __fireEnd: () => {
      for (const fn of getListeners('end')) fn(null);
    },
    __fireResult: (event: unknown) => {
      for (const fn of getListeners('result')) fn(event);
    },
    __clearListeners: () => {
      for (const key of Object.keys(listenersByEvent)) delete listenersByEvent[key];
    },
  };
});

jest.mock('expo-localization', () => ({
  __esModule: true,
  getLocales: jest.fn().mockReturnValue([{ languageTag: 'en-US' }]),
}));

import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';

const speechMock = jest.requireMock('expo-speech-recognition') as {
  __clearListeners: () => void;
  __fireEnd: () => void;
  __fireResult: (event: unknown) => void;
  ExpoSpeechRecognitionModule: {
    start: jest.Mock;
    stop: jest.Mock;
    supportsOnDeviceRecognition: jest.Mock;
    getSupportedLocales: jest.Mock;
  };
};

async function settleCapture() {
  await VoiceInput.cancelCapture().catch(() => undefined);
}

describe('on-device recognition is only requested for an installed locale', () => {
  beforeEach(() => {
    speechMock.__clearListeners();
    speechMock.ExpoSpeechRecognitionModule.start.mockClear();
    speechMock.ExpoSpeechRecognitionModule.stop.mockClear();
    speechMock.ExpoSpeechRecognitionModule.supportsOnDeviceRecognition.mockReturnValue(true);
    speechMock.ExpoSpeechRecognitionModule.getSupportedLocales.mockResolvedValue({
      locales: ['en-US', 'fr-FR'],
      installedLocales: ['en-US'],
    });
  });

  afterEach(async () => {
    await settleCapture();
  });

  it('starts on-device when the language has an installed model', async () => {
    const session = await VoiceInput.startCaptureSession(undefined, undefined, { lang: 'en' });
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en-US', requiresOnDeviceRecognition: true }),
    );
    session.result.catch(() => undefined);
  });

  it('refuses a language whose on-device model is not installed, and names it', async () => {
    const error = await VoiceInput.startCaptureSession(undefined, undefined, {
      lang: 'fr',
    }).catch((err: unknown) => err);

    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    expect((error as VoiceInput.VoiceCaptureError).code).toBe('on-device-recognition-unavailable');
    expect((error as Error).message).toContain('French');
  });

  it('keeps the on-device request when the platform cannot list installed locales', async () => {
    speechMock.ExpoSpeechRecognitionModule.getSupportedLocales.mockResolvedValue({
      locales: [],
      installedLocales: [],
    });
    const session = await VoiceInput.startCaptureSession(undefined, undefined, { lang: 'fr' });
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: true }),
    );
    session.result.catch(() => undefined);
  });

  it('names an explicit audio category so a headset route survives', async () => {
    const session = await VoiceInput.startCaptureSession(undefined, undefined, { lang: 'en' });
    const options = speechMock.ExpoSpeechRecognitionModule.start.mock.calls[0]?.[0] as {
      iosCategory?: { categoryOptions?: string[] };
    };
    expect(options.iosCategory?.categoryOptions).toContain('allowBluetooth');
    session.result.catch(() => undefined);
  });

  it('keeps the device region when the setting names the same language', () => {
    expect(VoiceInput.resolveRecognitionLocale('en')).toBe('en-US');
    expect(VoiceInput.resolveRecognitionLocale('es')).toBe('es');
    expect(VoiceInput.resolveRecognitionLocale(undefined)).toBe('en-US');
  });
});

describe('listening has a client-side maximum duration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    speechMock.__clearListeners();
    speechMock.ExpoSpeechRecognitionModule.start.mockClear();
    speechMock.ExpoSpeechRecognitionModule.stop.mockClear();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await settleCapture();
  });

  it('stops the recognizer once the cap is reached', async () => {
    const session = await VoiceInput.startCaptureSession(undefined, undefined, {
      lang: 'en',
      maxDurationMs: 1_000,
    });
    session.result.catch(() => undefined);

    expect(ExpoSpeechRecognitionModule.stop).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_000);
    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalled();
  });

  it('settles with whatever was heard rather than hanging forever', async () => {
    const session = await VoiceInput.startCaptureSession(undefined, undefined, {
      lang: 'en',
      maxDurationMs: 1_000,
    });
    speechMock.__fireResult({ results: [{ transcript: 'half a sentence' }], isFinal: false });

    jest.advanceTimersByTime(1_000);
    jest.advanceTimersByTime(2_000);

    await expect(session.result).resolves.toMatchObject({ text: 'half a sentence' });
    expect(VoiceInput.isCapturing()).toBe(false);
  });

  it('reports the timeout when nothing was heard at all', async () => {
    const session = await VoiceInput.startCaptureSession(undefined, undefined, {
      lang: 'en',
      maxDurationMs: 1_000,
    });

    jest.advanceTimersByTime(1_000);
    jest.advanceTimersByTime(2_000);

    const error = await session.result.catch((err: unknown) => err);
    expect((error as VoiceInput.VoiceCaptureError).code).toBe('max-duration-reached');
  });

  it('cancels the timer when the capture finishes normally', async () => {
    const session = await VoiceInput.startCaptureSession(undefined, undefined, {
      lang: 'en',
      maxDurationMs: 1_000,
    });
    speechMock.__fireResult({ results: [{ transcript: 'done' }], isFinal: true });
    await expect(session.result).resolves.toMatchObject({ text: 'done' });

    jest.advanceTimersByTime(5_000);
    expect(ExpoSpeechRecognitionModule.stop).not.toHaveBeenCalled();
  });
});
