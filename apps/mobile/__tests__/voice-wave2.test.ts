/**
 * Wave 2 voice feature tests.
 * Covers: voiceInput service, voiceOutput service contracts.
 */

import { Platform } from 'react-native';

// Mock expo-av
jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    Recording: jest.fn().mockImplementation(() => ({
      prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
      startAsync: jest.fn().mockResolvedValue(undefined),
      stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined),
      getStatusAsync: jest.fn().mockResolvedValue({
        isRecording: true,
        metering: -30,
        durationMillis: 1000,
      }),
      getURI: jest.fn().mockReturnValue('file:///tmp/recording.m4a'),
    })),
    AndroidOutputFormat: { MPEG_4: 2 },
    AndroidAudioEncoder: { AAC: 3 },
    IOSOutputFormat: { MPEG4AAC: 'aac' },
    IOSAudioQuality: { HIGH: 0x60 },
  },
}));

// Mock expo-speech
jest.mock('expo-speech', () => ({
  speak: jest.fn().mockImplementation((_text: string, opts?: { onDone?: () => void }) => {
    opts?.onDone?.();
  }),
  stop: jest.fn().mockResolvedValue(undefined),
  isSpeakingAsync: jest.fn().mockResolvedValue(false),
  getAvailableVoicesAsync: jest.fn().mockResolvedValue([]),
}));

import * as VoiceInput from '@/services/voiceInput';
import * as VoiceOutput from '@/services/voiceOutput';

describe('voiceInput service', () => {
  beforeEach(() => {
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

  it('requestMicPermission delegates to expo-av', async () => {
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
    Object.defineProperty(Platform, 'OS', { get: () => originalOS });
  });

  it('returns ios-speech on ios', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
    jest.isolateModules(() => {
      // re-import to pick up platform change
      const mod = jest.requireActual<typeof VoiceInput>('@/services/voiceInput');
      expect(mod.getPlatformSTTBackend()).toBe('ios-speech');
    });
  });

  it('returns android-speech-recognizer on android', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    jest.isolateModules(() => {
      const mod = jest.requireActual<typeof VoiceInput>('@/services/voiceInput');
      expect(mod.getPlatformSTTBackend()).toBe('android-speech-recognizer');
    });
  });
});
