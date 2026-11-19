jest.mock('expo-speech-recognition', () => ({
  __esModule: true,
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    getPermissionsAsync: jest.fn(),
    requestMicrophonePermissionsAsync: jest.fn(),
    getMicrophonePermissionsAsync: jest.fn(),
    supportsOnDeviceRecognition: jest.fn().mockReturnValue(true),
    getSupportedLocales: jest.fn().mockResolvedValue({ installedLocales: ['en-US'] }),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('expo-localization', () => ({
  __esModule: true,
  getLocales: jest.fn().mockReturnValue([{ languageTag: 'en-US' }]),
}));

import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import * as VoiceInput from '@/src/features/voice/services/voiceInput';
import { isMicPermissionRequestPending } from '@/src/features/voice/services/micPermissionRequest';

const recognizer = ExpoSpeechRecognitionModule as unknown as Record<string, jest.Mock>;

const granted = { status: 'granted', granted: true, canAskAgain: true };
const notYetAsked = { status: 'denied', granted: false, canAskAgain: true };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe('the microphone permission is only requested when it is not already granted', () => {
  beforeEach(() => {
    recognizer.start.mockClear();
    recognizer.requestPermissionsAsync.mockReset();
    recognizer.getPermissionsAsync.mockReset();
    recognizer.requestMicrophonePermissionsAsync.mockReset();
    recognizer.getMicrophonePermissionsAsync.mockReset();
  });

  afterEach(async () => {
    await VoiceInput.cancelCapture();
  });

  it('starts capture without asking when the permission is already granted', async () => {
    recognizer.getPermissionsAsync.mockResolvedValue(granted);

    const session = await VoiceInput.startCaptureSession();

    expect(recognizer.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(recognizer.start).toHaveBeenCalledTimes(1);
    await session.cancel();
  });

  it('asks once and starts capture after the person allows', async () => {
    recognizer.getPermissionsAsync.mockResolvedValue(notYetAsked);
    recognizer.requestPermissionsAsync.mockResolvedValue(granted);

    const session = await VoiceInput.startCaptureSession();

    expect(recognizer.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(recognizer.start).toHaveBeenCalledTimes(1);
    await session.cancel();
  });

  it('refuses to listen when the person does not allow', async () => {
    recognizer.getPermissionsAsync.mockResolvedValue(notYetAsked);
    recognizer.requestPermissionsAsync.mockResolvedValue(notYetAsked);

    await expect(VoiceInput.startCaptureSession()).rejects.toMatchObject({
      code: 'mic-permission-denied',
    });
    expect(recognizer.start).not.toHaveBeenCalled();
  });

  it('asks when the current answer cannot be read', async () => {
    recognizer.getPermissionsAsync.mockRejectedValue(new Error('unavailable'));
    recognizer.requestPermissionsAsync.mockResolvedValue(granted);

    await expect(VoiceInput.requestMicPermission()).resolves.toBe(true);
    expect(recognizer.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('answers false when the request itself fails', async () => {
    recognizer.getPermissionsAsync.mockResolvedValue(notYetAsked);
    recognizer.requestPermissionsAsync.mockRejectedValue(new Error('no activity'));

    await expect(VoiceInput.requestMicPermission()).resolves.toBe(false);
    expect(isMicPermissionRequestPending()).toBe(false);
  });

  it('reads the microphone alone before asking for it', async () => {
    recognizer.getMicrophonePermissionsAsync.mockResolvedValue(granted);

    await expect(VoiceInput.requestMicrophoneOnlyPermission()).resolves.toBe(true);
    expect(recognizer.requestMicrophonePermissionsAsync).not.toHaveBeenCalled();

    recognizer.getMicrophonePermissionsAsync.mockResolvedValue(notYetAsked);
    recognizer.requestMicrophonePermissionsAsync.mockResolvedValue(granted);
    await expect(VoiceInput.requestMicrophoneOnlyPermission()).resolves.toBe(true);
    expect(recognizer.requestMicrophonePermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('marks a request as pending only while the system answer is awaited', async () => {
    const answer = deferred<typeof granted>();
    recognizer.getPermissionsAsync.mockResolvedValue(notYetAsked);
    recognizer.requestPermissionsAsync.mockReturnValue(answer.promise);

    const pending = VoiceInput.requestMicPermission();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recognizer.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(isMicPermissionRequestPending()).toBe(true);

    answer.resolve(granted);
    await expect(pending).resolves.toBe(true);
    expect(isMicPermissionRequestPending()).toBe(false);
  });

  it('never marks a request as pending when the permission is already granted', async () => {
    recognizer.getPermissionsAsync.mockResolvedValue(granted);

    await VoiceInput.requestMicPermission();

    expect(isMicPermissionRequestPending()).toBe(false);
    expect(recognizer.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
