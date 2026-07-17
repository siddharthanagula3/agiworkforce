/**
 * Regression tests for voice.ts's `_activeCapturePromise` lifecycle around a
 * NATURAL stop (the recognizer self-stopping via `continuous: false` after a
 * few seconds of silence) as opposed to an explicit stopRecording()/
 * cancelRecording() call. This is the normal case, not an edge case -- a
 * user who pauses mid-sentence, or simply doesn't tap "stop" the instant
 * they finish speaking, hits it on every recording.
 *
 * Bug 1 (permanent lockout): `_activeCapturePromise` used to be nulled only
 * on the rejection path (`.catch`), never on natural success, so a natural
 * stop left it non-null forever and every later startRecording() anywhere
 * in the app threw "Recording already in progress" until the app was
 * force-quit.
 *
 * Bug 2 (introduced by the Bug 1 fix, caught before shipping): once
 * `_activeCapturePromise` is nulled on natural success, `stopRecording()`'s
 * `if (!_activeCapturePromise) throw ...` guard fires for the very common
 * case of "recognizer already stopped itself, user taps stop afterward" --
 * the UI has no live signal for natural completion (see
 * `VoiceMeteringEvent.isDoneRecording`, always false), so tap-to-stop
 * reliably lands in this state. That must not throw away a valid,
 * not-yet-consumed transcript sitting in `_lastResult`.
 */

// Mirrors the mock shape used by voice-input-button-long-press.test.tsx,
// plus an explicit __fireEnd hook (like voice-wave2.test.ts) so a natural
// stop can be simulated independently of ExpoSpeechRecognitionModule.stop()
// being called.
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

    // Simulate the recognizer self-stopping (silence timeout) -- nobody
    // called stopRecording()/cancelRecording().
    __fireResult({ results: [{ transcript: 'hello there', confidence: 0.9 }], isFinal: false });
    await Promise.resolve();
    __fireEnd();
    // Let the promise chain (including voice.ts's own .finally()) settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(VoiceInput.isCapturing()).toBe(false);

    // This is the reported bug: before the fix, this threw "Recording
    // already in progress" forever, because nothing ever cleared
    // voice.ts's internal _activeCapturePromise guard on the success path.
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

    // Tap-to-stop after the recognizer already ended naturally must not
    // throw "No recording in progress" and drop the transcript -- the UI
    // has no live signal telling it the session already ended, so this is
    // the common path, not a rare race.
    await expect(VoiceService.stopRecording()).resolves.toBe('');

    const result = await VoiceService.transcribe('');
    expect(result.text).toBe('buy milk tomorrow');
  });

  it('does not produce an unhandled promise rejection when a recording is cancelled', async () => {
    // Regression for the fix itself: swapping the original .catch() (which
    // both cleared the guard AND swallowed the rejection) for .finally()
    // dropped the swallow -- .finally() is transparent to rejection, so the
    // void'd, unawaited chain became an unhandled rejection on every
    // cancelRecording() (long-press handoff, overlay cancel) and every real
    // recognition-error, not just a rare case.
    const unhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      await VoiceService.startRecording();
      await VoiceService.cancelRecording();

      // Give Node's unhandled-rejection detection (and any microtask-queued
      // .catch handlers) several turns to settle before asserting.
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
      }
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }

    expect(unhandled).toHaveLength(0);
    // The guard must still be cleared by the cancel path, same as before
    // this fix -- a subsequent recording must be startable immediately.
    await expect(VoiceService.startRecording()).resolves.toBeUndefined();
  });
});
