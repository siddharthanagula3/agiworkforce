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
      requestMicrophonePermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
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
import * as TTS from '@/src/features/voice/services/tts';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

const speechRecognitionMock = jest.requireMock('expo-speech-recognition') as {
  __clearListeners: () => void;
  __fireResult: (event: unknown) => void;
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

  it('asks live voice for the microphone alone, not speech recognition', async () => {
    const module = speechRecognitionMock.ExpoSpeechRecognitionModule as unknown as {
      requestMicrophonePermissionsAsync: jest.Mock;
      requestPermissionsAsync: jest.Mock;
    };
    module.requestPermissionsAsync.mockClear();

    await expect(VoiceInput.requestMicrophoneOnlyPermission()).resolves.toBe(true);

    expect(module.requestMicrophonePermissionsAsync).toHaveBeenCalledTimes(1);
    expect(module.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('transcribeAudioFile reads the given recording instead of the microphone', async () => {
    const pending = VoiceInput.transcribeAudioFile('file:///test.m4a');
    await Promise.resolve();
    await Promise.resolve();
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ audioSource: { uri: 'file:///test.m4a' } }),
    );
    speechRecognitionMock.__fireResult({
      results: [{ transcript: 'from the file', confidence: 0.9 }],
      isFinal: true,
    });
    const result = await pending;
    expect(result.text).toBe('from the file');
  });

  it('transcribeAudioFile refuses an empty uri instead of returning a stale transcript', async () => {
    await expect(VoiceInput.transcribeAudioFile('')).rejects.toThrow('No audio file was provided.');
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
    expect(VoiceInput.isCapturing()).toBe(false);
  });

  it('does not start when on-device speech recognition is unavailable', async () => {
    speechRecognitionMock.ExpoSpeechRecognitionModule.supportsOnDeviceRecognition.mockReturnValueOnce(
      false,
    );

    await expect(VoiceService.startRecording()).rejects.toMatchObject({
      code: 'on-device-recognition-unavailable',
    });

    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    expect(VoiceInput.isCapturing()).toBe(false);
  });
});

describe('voiceOutput service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('owned speech completes for short text', async () => {
    const owner = VoiceOutput.createVoiceOutputOwner({ scope: 'local' });
    await expect(owner.start('Hello').done).resolves.toEqual({ status: 'done' });
  });

  it('isSpeaking returns false when not speaking', async () => {
    const result = await VoiceOutput.isSpeaking();
    expect(result).toBe(false);
  });

  it('getAvailableVoices returns an array', async () => {
    const voices = await VoiceOutput.getAvailableVoices();
    expect(Array.isArray(voices)).toBe(true);
  });

  it('reports a failed voice inventory to the picker instead of an empty one', async () => {
    const speech = jest.requireMock('expo-speech') as { getAvailableVoicesAsync: jest.Mock };
    speech.getAvailableVoicesAsync.mockRejectedValueOnce(new Error('inventory unavailable'));
    await expect(TTS.getVoicesForLanguage('fr')).rejects.toThrow('inventory unavailable');

    speech.getAvailableVoicesAsync.mockRejectedValueOnce(new Error('inventory unavailable'));
    await expect(TTS.getAvailableVoices()).resolves.toEqual([]);
  });

  it('stop does not throw', async () => {
    const owner = VoiceOutput.createVoiceOutputOwner({ scope: 'local' });
    await expect(owner.stop()).resolves.toBeUndefined();
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
