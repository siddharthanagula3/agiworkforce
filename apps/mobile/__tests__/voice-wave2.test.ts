// AUDIT-FIX: STT-WIRE
/**
 * Wave 2 voice feature tests.
 * Covers: voiceInput service (on-device STT), voiceOutput service contracts.
 */

import { Platform } from 'react-native';

jest.mock('expo-speech-recognition', () => {
  const listenersByEvent = {};
  const getListeners = (name) => (listenersByEvent[name] ||= []);
  return {
    __esModule: true,
    ExpoSpeechRecognitionModule: {
      start: jest.fn(),
      stop: jest.fn(() => {
        for (const fn of getListeners('end')) fn(null);
      }),
      abort: jest.fn(),
      requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
      supportsOnDeviceRecognition: jest.fn().mockReturnValue(true),
      isRecognitionAvailable: jest.fn().mockReturnValue(true),
      addListener: jest.fn((name, fn) => {
        getListeners(name).push(fn);
        return {
          remove: () => {
            listenersByEvent[name] = getListeners(name).filter((cb) => cb !== fn);
          },
        };
      }),
    },
    __fireResult: (event) => {
      for (const fn of getListeners('result')) fn(event);
    },
    __fireError: (event) => {
      for (const fn of getListeners('error')) fn(event);
    },
    __fireEnd: () => {
      for (const fn of getListeners('end')) fn(null);
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

jest.mock('expo-speech', () => ({
  speak: jest.fn().mockImplementation((_text: string, opts?: { onDone?: () => void }) => {
    opts?.onDone?.();
  }),
  stop: jest.fn().mockResolvedValue(undefined),
  isSpeakingAsync: jest.fn().mockResolvedValue(false),
  getAvailableVoicesAsync: jest.fn().mockResolvedValue([]),
}));

import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import * as VoiceService from '@/src/features/voice/services/voice';
import * as VoiceOutput from '@/src/features/voice/services/voiceOutput';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

const speechRecognitionMock = jest.requireMock('expo-speech-recognition') as {
  __clearListeners: () => void;
  ExpoSpeechRecognitionModule: {
    start: jest.Mock;
    requestPermissionsAsync: jest.Mock;
    supportsOnDeviceRecognition: jest.Mock;
  };
};

describe('voiceInput service', () => {
  beforeEach(() => {
    speechRecognitionMock.__clearListeners();
    jest.clearAllMocks();
  });

  it('returns a valid platform STT backend', () => {
    const backend = VoiceInput.getPlatformSTTBackend();
    const valid = ['ios-speech', 'android-speech-recognizer', 'expo-av'];
    expect(valid).toContain(backend);
  });

  it('isCapturing returns false when idle', () => {
    expect(VoiceInput.isCapturing()).toBe(false);
  });

  it('requestMicPermission delegates to expo-speech-recognition', async () => {
    const result = await VoiceInput.requestMicPermission();
    expect(result).toBe(true);
  });

  it('transcribeOnDevice returns isOnDevice: true', async () => {
    const result = await VoiceInput.transcribeOnDevice('file:///test.m4a');
    expect(result.isOnDevice).toBe(true);
    expect(typeof result.text).toBe('string');
  });

  it('cancelCapture is safe when no recording is active', async () => {
    await expect(VoiceInput.cancelCapture()).resolves.toBeUndefined();
  });

  it('fails closed when speech recognition permission is denied', async () => {
    speechRecognitionMock.ExpoSpeechRecognitionModule.requestPermissionsAsync.mockResolvedValueOnce(
      {
        granted: false,
        status: 'denied',
        canAskAgain: false,
        expires: 'never',
      },
    );

    await expect(VoiceService.startRecording()).rejects.toMatchObject({
      code: 'mic-permission-denied',
    });

    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    expect(VoiceService.isRecording()).toBe(false);
  });

  it('does not start when on-device speech recognition is unavailable', async () => {
    speechRecognitionMock.ExpoSpeechRecognitionModule.supportsOnDeviceRecognition.mockReturnValueOnce(
      false,
    );

    await expect(VoiceService.startRecording()).rejects.toMatchObject({
      code: 'on-device-recognition-unavailable',
    });

    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    expect(VoiceService.isRecording()).toBe(false);
  });
});

describe('voiceOutput service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('speak resolves for short text', async () => {
    await expect(VoiceOutput.speak('Hello')).resolves.toBeUndefined();
  });

  it('isSpeaking returns false when not speaking', async () => {
    const result = await VoiceOutput.isSpeaking();
    expect(result).toBe(false);
  });

  it('getAvailableVoices returns an array', async () => {
    const voices = await VoiceOutput.getAvailableVoices();
    expect(Array.isArray(voices)).toBe(true);
  });

  it('stop does not throw', async () => {
    await expect(VoiceOutput.stop()).resolves.toBeUndefined();
  });
});

describe('VoiceInput.getPlatformSTTBackend platform detection', () => {
  const originalOS = Platform.OS;

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  });

  it('returns ios-speech on ios', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
    expect(VoiceInput.getPlatformSTTBackend()).toBe('ios-speech');
  });

  it('returns android-speech-recognizer on android', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    expect(VoiceInput.getPlatformSTTBackend()).toBe('android-speech-recognizer');
  });
});
