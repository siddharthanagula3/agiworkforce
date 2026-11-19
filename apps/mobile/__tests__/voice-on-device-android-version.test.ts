jest.mock('expo-speech-recognition', () => ({
  __esModule: true,
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    supportsOnDeviceRecognition: jest.fn().mockReturnValue(true),
    getSupportedLocales: jest.fn().mockResolvedValue({ locales: [], installedLocales: [] }),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('expo-localization', () => ({
  __esModule: true,
  getLocales: jest.fn().mockReturnValue([{ languageTag: 'en-US' }]),
}));

import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import { voiceFailureMessage } from '@/src/features/voice/services/voiceFailure';

const speech = ExpoSpeechRecognitionModule as unknown as {
  start: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  supportsOnDeviceRecognition: jest.Mock;
};

const originalOS = Platform.OS;
const originalVersion = Platform.Version;

function runOn(os: 'ios' | 'android', version: number | string) {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
  Object.defineProperty(Platform, 'Version', { get: () => version, configurable: true });
}

async function captureOutcome(): Promise<unknown> {
  try {
    const session = await VoiceInput.startCaptureSession(undefined, undefined, { lang: 'en' });
    session.result.catch(() => undefined);
    return session;
  } catch (error) {
    return error;
  }
}

async function transcriptionOutcome(): Promise<unknown> {
  const pending = VoiceInput.transcribeAudioFile('file:///cache/memo.m4a', { lang: 'en' });
  pending.catch(() => undefined);
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (VoiceInput.isCapturing()) {
    await VoiceInput.cancelCapture();
  }
  return pending.catch((error: unknown) => error);
}

beforeEach(() => {
  speech.start.mockClear();
  speech.requestPermissionsAsync.mockClear();
  speech.supportsOnDeviceRecognition.mockReset().mockReturnValue(true);
});

afterEach(async () => {
  await VoiceInput.cancelCapture().catch(() => undefined);
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  Object.defineProperty(Platform, 'Version', { get: () => originalVersion, configurable: true });
});

describe('dictation on Android stays on the device or does not start', () => {
  it.each([26, 28, 30])(
    'refuses on API %i, where the library reports no on-device recognizer',
    async (api) => {
      runOn('android', api);
      speech.supportsOnDeviceRecognition.mockReturnValue(false);

      const error = await captureOutcome();

      expect(speech.start).not.toHaveBeenCalled();
      expect((error as VoiceInput.VoiceCaptureError).code).toBe(
        'on-device-recognition-unavailable',
      );
      expect(voiceFailureMessage(error)).toBe(
        'On-device voice recognition is not available on this device.',
      );
    },
  );

  it.each([26, 30, 31, 32])(
    'refuses on API %i even when the library says on-device recognition is available',
    async (api) => {
      runOn('android', api);

      const error = await captureOutcome();

      expect(speech.start).not.toHaveBeenCalled();
      expect((error as VoiceInput.VoiceCaptureError).code).toBe(
        'on-device-recognition-unavailable',
      );
      expect(voiceFailureMessage(error)).toBe(
        'On-device voice recognition is not available on this device.',
      );
    },
  );

  it.each([26, 30, 31, 32])('refuses on API %i before asking for the microphone', async (api) => {
    runOn('android', api);

    const error = await captureOutcome();

    expect((error as VoiceInput.VoiceCaptureError).code).toBe('on-device-recognition-unavailable');
    expect(speech.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['android', 33],
    ['ios', '17.5'],
  ] as const)('asks for the microphone on %s %s as before', async (os, version) => {
    runOn(os, version);

    await captureOutcome();

    expect(speech.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it.each([31, 32])('does not transcribe an audio file on API %i', async (api) => {
    runOn('android', api);

    const error = await transcriptionOutcome();

    expect(speech.start).not.toHaveBeenCalled();
    expect((error as VoiceInput.VoiceCaptureError).code).toBe('on-device-recognition-unavailable');
  });

  it.each([33, 34, 36])('starts the on-device recognizer on API %i', async (api) => {
    runOn('android', api);

    await captureOutcome();

    expect(speech.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: true }),
    );
  });

  it('still refuses on API 33 when the device has no on-device recognizer', async () => {
    runOn('android', 33);
    speech.supportsOnDeviceRecognition.mockReturnValue(false);

    const error = await captureOutcome();

    expect(speech.start).not.toHaveBeenCalled();
    expect((error as VoiceInput.VoiceCaptureError).code).toBe('on-device-recognition-unavailable');
  });

  it('leaves iOS dictation as it was, whatever the version string', async () => {
    runOn('ios', '17.5');

    await captureOutcome();

    expect(speech.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: true }),
    );
  });
});
