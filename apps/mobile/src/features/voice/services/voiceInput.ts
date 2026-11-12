import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import { audioSessionCategoryFor, type AudioRoute } from './audioRoute';
import { activeAudioRoute, deviceSpeechLocale } from './speechSettings';

export type VoiceCaptureErrorCode =
  | 'mic-permission-denied'
  | 'on-device-recognition-unavailable'
  | 'aborted'
  | 'recognition-error'
  | 'already-active'
  | 'max-duration-reached'
  | 'voice-input-disabled';

export class VoiceCaptureError extends Error {
  readonly code: VoiceCaptureErrorCode;
  readonly nativeCode?: ExpoSpeechRecognitionErrorCode;
  constructor(
    code: VoiceCaptureErrorCode,
    message: string,
    nativeCode?: ExpoSpeechRecognitionErrorCode,
  ) {
    super(message);
    this.name = 'VoiceCaptureError';
    this.code = code;
    this.nativeCode = nativeCode;
  }
}

export interface OnDeviceTranscriptResult {
  text: string;
  isOnDevice: true;
  confidence: number;
}

export interface VoiceInputMeteringEvent {
  metering: number;
  durationMillis: number;
}

export interface VoicePartialResult {
  text: string;
  isFinal: boolean;
}

export interface VoiceCaptureSession {
  result: Promise<OnDeviceTranscriptResult>;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
}

export interface VoiceCaptureOptions {
  lang?: string;
  maxDurationMs?: number;
  audioRoute?: AudioRoute;
  signal?: AbortSignal;
}

type MeteringCallback = (event: VoiceInputMeteringEvent) => void;
type PartialCallback = (event: VoicePartialResult) => void;

/** A capture longer than this is a stuck recognizer, not a sentence. */
export const MAX_LISTEN_MS = 60_000;
const STOP_GRACE_MS = 1_500;

// The recognizer keeps the audio session on this device, so the chosen route has
// to be named on every start or the last session's routing is what you get.

interface CaptureAttempt {
  result: Promise<OnDeviceTranscriptResult>;
  resolve: (result: OnDeviceTranscriptResult) => void;
  reject: (error: VoiceCaptureError) => void;
  listeners: Array<{ remove: () => void }>;
  startedAt: number;
  started: boolean;
  settled: boolean;
  partial: string;
  confidence: number;
  durationTimer: ReturnType<typeof setTimeout> | null;
  stopTimer: ReturnType<typeof setTimeout> | null;
  removeAbort: () => void;
}

let activeCapture: CaptureAttempt | null = null;

function ownsCapture(attempt: CaptureAttempt): boolean {
  return activeCapture === attempt && !attempt.settled;
}

function settleCapture(attempt: CaptureAttempt, error?: VoiceCaptureError): void {
  if (attempt.settled) return;
  attempt.settled = true;
  if (activeCapture === attempt) activeCapture = null;
  if (attempt.durationTimer !== null) clearTimeout(attempt.durationTimer);
  if (attempt.stopTimer !== null) clearTimeout(attempt.stopTimer);
  attempt.removeAbort();
  for (const listener of attempt.listeners) {
    try {
      listener.remove();
    } catch {
      console.warn('[voiceInput] listener cleanup failed');
    }
  }
  attempt.listeners = [];
  if (error) attempt.reject(error);
  else attempt.resolve({ text: attempt.partial, confidence: attempt.confidence, isOnDevice: true });
}

function cancelAttempt(attempt: CaptureAttempt): void {
  const shouldAbort = ownsCapture(attempt) && attempt.started;
  settleCapture(attempt, new VoiceCaptureError('aborted', 'Capture cancelled'));
  if (shouldAbort) {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      console.warn('[voiceInput] native recognition abort failed');
    }
  }
}

function createCapture(signal?: AbortSignal): CaptureAttempt {
  if (activeCapture)
    throw new VoiceCaptureError('already-active', 'Voice capture already in progress');
  let resolve!: CaptureAttempt['resolve'];
  let reject!: CaptureAttempt['reject'];
  const result = new Promise<OnDeviceTranscriptResult>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  void result.catch(() => undefined);
  const attempt: CaptureAttempt = {
    result,
    resolve,
    reject,
    listeners: [],
    startedAt: 0,
    started: false,
    settled: false,
    partial: '',
    confidence: -1,
    durationTimer: null,
    stopTimer: null,
    removeAbort: () => undefined,
  };
  activeCapture = attempt;
  if (signal) {
    const abort = () => cancelAttempt(attempt);
    signal.addEventListener('abort', abort, { once: true });
    attempt.removeAbort = () => signal.removeEventListener('abort', abort);
    if (signal.aborted) abort();
  }
  return attempt;
}

function assertCapture(attempt: CaptureAttempt): void {
  if (!ownsCapture(attempt)) throw new VoiceCaptureError('aborted', 'Capture cancelled');
}

function stopAttempt(attempt: CaptureAttempt, maximumDuration = false): void {
  if (!ownsCapture(attempt) || attempt.stopTimer !== null) return;
  if (!attempt.started) {
    cancelAttempt(attempt);
    return;
  }
  attempt.stopTimer = setTimeout(() => {
    attempt.stopTimer = null;
    if (!ownsCapture(attempt)) return;
    settleCapture(
      attempt,
      maximumDuration && !attempt.partial.trim()
        ? new VoiceCaptureError(
            'max-duration-reached',
            'Listening stopped after a minute. Tap the microphone to start again.',
          )
        : undefined,
    );
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      console.warn('[voiceInput] native recognition abort failed');
    }
  }, STOP_GRACE_MS);
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    console.warn('[voiceInput] native recognition stop failed');
  }
}

export function getPlatformSTTBackend(): 'ios-speech' | 'android-speech-recognizer' | 'expo-av' {
  if (Platform.OS === 'ios') return 'ios-speech';
  if (Platform.OS === 'android') return 'android-speech-recognizer';
  return 'expo-av';
}

export async function requestMicPermission(): Promise<boolean> {
  try {
    const status = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return status.granted;
  } catch {
    return false;
  }
}

export async function requestMicrophoneOnlyPermission(): Promise<boolean> {
  try {
    const status = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
    return status.granted;
  } catch {
    return false;
  }
}

export function isCapturing(): boolean {
  return activeCapture !== null;
}

function baseLanguage(tag: string): string {
  return tag.toLowerCase().replace('_', '-').split('-')[0] ?? '';
}

/** A setting like "fr" keeps the device's region when the two agree. */
export function resolveRecognitionLocale(preferred?: string): string {
  const deviceTag = deviceSpeechLocale();
  if (!preferred) return deviceTag;
  if (baseLanguage(deviceTag) === baseLanguage(preferred)) return deviceTag;
  return preferred;
}

/**
 * Requesting on-device recognition for a locale with no installed model makes
 * the recognizer fail mid-capture. Ask first; when the platform cannot answer,
 * keep the on-device request rather than sending audio anywhere else.
 */
export async function isOnDeviceLocaleAvailable(lang: string): Promise<boolean> {
  if (typeof ExpoSpeechRecognitionModule.getSupportedLocales !== 'function') return true;
  try {
    const supported = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    const installed = supported?.installedLocales;
    if (!Array.isArray(installed) || installed.length === 0) return true;
    const base = baseLanguage(lang);
    return installed.some((locale) => baseLanguage(String(locale)) === base);
  } catch {
    return true;
  }
}

function languageLabel(lang: string): string {
  const DisplayNamesConstructor = Intl.DisplayNames;
  if (typeof DisplayNamesConstructor !== 'function') return lang;
  try {
    return new DisplayNamesConstructor(['en'], { type: 'language' }).of(baseLanguage(lang)) ?? lang;
  } catch {
    return lang;
  }
}

/**
 * Speech stays on this device, so a missing on-device model is a refusal with a
 * reason, never a quiet switch to server recognition.
 */
async function assertOnDeviceRecognition(lang: string): Promise<void> {
  if (
    typeof ExpoSpeechRecognitionModule.supportsOnDeviceRecognition === 'function' &&
    !ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
  ) {
    throw new VoiceCaptureError(
      'on-device-recognition-unavailable',
      'On-device voice recognition is not available on this device.',
    );
  }
  if (await isOnDeviceLocaleAvailable(lang)) return;
  throw new VoiceCaptureError(
    'on-device-recognition-unavailable',
    `${languageLabel(lang)} has no on-device speech model installed. Install it in your device's speech settings, or pick another speech language.`,
  );
}

function listenToCapture(
  attempt: CaptureAttempt,
  onMetering?: MeteringCallback,
  onPartial?: PartialCallback,
): void {
  attempt.listeners.push(
    ExpoSpeechRecognitionModule.addListener('result', (event) => {
      if (!ownsCapture(attempt)) return;
      const top = event.results?.[0];
      if (!top) return;
      attempt.partial = top.transcript;
      attempt.confidence = top.confidence ?? -1;
      onPartial?.({ text: top.transcript, isFinal: event.isFinal });
      if (event.isFinal && ownsCapture(attempt)) settleCapture(attempt);
    }),
  );
  attempt.listeners.push(
    ExpoSpeechRecognitionModule.addListener('end', () => {
      if (ownsCapture(attempt)) settleCapture(attempt);
    }),
  );
  attempt.listeners.push(
    ExpoSpeechRecognitionModule.addListener('error', (event) => {
      if (!ownsCapture(attempt)) return;
      const codes: Record<string, VoiceCaptureErrorCode> = {
        'not-allowed': 'mic-permission-denied',
        'service-not-allowed': 'on-device-recognition-unavailable',
        'language-not-supported': 'on-device-recognition-unavailable',
        aborted: 'aborted',
      };
      settleCapture(
        attempt,
        new VoiceCaptureError(
          codes[event.error] ?? 'recognition-error',
          event.message || event.error,
          event.error,
        ),
      );
    }),
  );
  if (onMetering) {
    attempt.listeners.push(
      ExpoSpeechRecognitionModule.addListener('volumechange', (event) => {
        if (!ownsCapture(attempt)) return;
        onMetering({
          metering: Math.max(-160, Math.min(0, event.value * 16 - 160)),
          durationMillis: Date.now() - attempt.startedAt,
        });
      }),
    );
  }
}

function captureError(error: unknown): VoiceCaptureError {
  return error instanceof VoiceCaptureError
    ? error
    : new VoiceCaptureError(
        'recognition-error',
        error instanceof Error ? error.message : 'Failed to start recognizer',
      );
}

export async function startCaptureSession(
  onMetering?: MeteringCallback,
  onPartial?: PartialCallback,
  options?: VoiceCaptureOptions,
): Promise<VoiceCaptureSession> {
  const attempt = createCapture(options?.signal);
  try {
    assertCapture(attempt);
    const granted = await requestMicPermission();
    assertCapture(attempt);
    if (!granted)
      throw new VoiceCaptureError('mic-permission-denied', 'Microphone permission denied');
    const lang = resolveRecognitionLocale(options?.lang);
    await assertOnDeviceRecognition(lang);
    assertCapture(attempt);
    attempt.startedAt = Date.now();
    listenToCapture(attempt, onMetering, onPartial);
    attempt.started = true;
    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
      iosCategory: audioSessionCategoryFor(options?.audioRoute ?? activeAudioRoute()),
      volumeChangeEventOptions: onMetering ? { enabled: true, intervalMillis: 100 } : undefined,
    });
    const duration = options?.maxDurationMs ?? MAX_LISTEN_MS;
    if (ownsCapture(attempt) && Number.isFinite(duration) && duration > 0) {
      attempt.durationTimer = setTimeout(() => stopAttempt(attempt, true), duration);
    }
  } catch (error) {
    const failure = captureError(error);
    const shouldAbort = ownsCapture(attempt) && attempt.started;
    settleCapture(attempt, failure);
    if (shouldAbort) {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        console.warn('[voiceInput] native recognition abort failed');
      }
    }
    throw failure;
  }
  return {
    result: attempt.result,
    stop: async () => stopAttempt(attempt),
    cancel: async () => cancelAttempt(attempt),
  };
}

export async function stopCapture(): Promise<void> {
  if (activeCapture) stopAttempt(activeCapture);
}

export async function cancelCapture(): Promise<void> {
  if (activeCapture) cancelAttempt(activeCapture);
}

export async function transcribeAudioFile(
  uri: string,
  options?: VoiceCaptureOptions,
): Promise<OnDeviceTranscriptResult> {
  if (!uri) throw new VoiceCaptureError('recognition-error', 'No audio file was provided.');
  const attempt = createCapture(options?.signal);
  try {
    assertCapture(attempt);
    const lang = resolveRecognitionLocale(options?.lang);
    await assertOnDeviceRecognition(lang);
    assertCapture(attempt);
    attempt.startedAt = Date.now();
    listenToCapture(attempt);
    attempt.started = true;
    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: false,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
      audioSource: { uri },
    });
    return await attempt.result;
  } catch (error) {
    const failure = captureError(error);
    const shouldAbort = ownsCapture(attempt) && attempt.started;
    settleCapture(attempt, failure);
    if (shouldAbort) {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        console.warn('[voiceInput] native recognition abort failed');
      }
    }
    throw failure;
  }
}
