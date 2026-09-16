import { Platform } from 'react-native';
import * as Localization from 'expo-localization';
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorCode,
  type SetCategoryOptions,
} from 'expo-speech-recognition';

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
}

export interface VoiceCaptureOptions {
  lang?: string;
  maxDurationMs?: number;
}

type MeteringCallback = (event: VoiceInputMeteringEvent) => void;
type PartialCallback = (event: VoicePartialResult) => void;

/** A capture longer than this is a stuck recognizer, not a sentence. */
export const MAX_LISTEN_MS = 60_000;
const STOP_GRACE_MS = 1_500;

/**
 * The recognizer keeps the audio session on this device. Naming the category
 * explicitly keeps a Bluetooth headset or speaker route working instead of
 * relying on whatever the last session left behind.
 */
const IOS_AUDIO_CATEGORY: SetCategoryOptions = {
  category: 'playAndRecord',
  categoryOptions: ['allowBluetooth', 'defaultToSpeaker'],
  mode: 'measurement',
};

let _active = false;
let _startedAt = 0;
let _listeners: Array<{ remove: () => void }> = [];
let _finalResolve: ((result: OnDeviceTranscriptResult) => void) | null = null;
let _finalReject: ((err: VoiceCaptureError) => void) | null = null;
let _latestPartial = '';
let _latestConfidence = -1;
let _maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
let _stopGraceTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers(): void {
  if (_maxDurationTimer !== null) clearTimeout(_maxDurationTimer);
  if (_stopGraceTimer !== null) clearTimeout(_stopGraceTimer);
  _maxDurationTimer = null;
  _stopGraceTimer = null;
}

function clearListeners(): void {
  for (const sub of _listeners) {
    try {
      sub.remove();
    } catch {
      // ignore
    }
  }
  _listeners = [];
}

function settleSuccess(text: string, confidence: number): void {
  _active = false;
  clearTimers();
  clearListeners();
  const resolver = _finalResolve;
  _finalResolve = null;
  _finalReject = null;
  resolver?.({ text, confidence, isOnDevice: true });
}

function settleError(err: VoiceCaptureError): void {
  _active = false;
  clearTimers();
  clearListeners();
  const rejecter = _finalReject;
  _finalResolve = null;
  _finalReject = null;
  rejecter?.(err);
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

export function isCapturing(): boolean {
  return _active;
}

function deviceLocaleTag(): string {
  try {
    const locales = Localization.getLocales();
    return locales[0]?.languageTag ?? 'en-US';
  } catch {
    return 'en-US';
  }
}

function baseLanguage(tag: string): string {
  return tag.toLowerCase().replace('_', '-').split('-')[0] ?? '';
}

/** A setting like "fr" keeps the device's region when the two agree. */
export function resolveRecognitionLocale(preferred?: string): string {
  const deviceTag = deviceLocaleTag();
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

/**
 * Begin speech recognition. Returns a promise that resolves with the final
 * transcript when the user stops, the recognizer reports `isFinal: true`, or
 * the client-side maximum duration is reached.
 */
export async function startCaptureSession(
  onMetering?: MeteringCallback,
  onPartial?: PartialCallback,
  options?: VoiceCaptureOptions,
): Promise<VoiceCaptureSession> {
  if (_active) {
    throw new VoiceCaptureError('already-active', 'Voice capture already in progress');
  }
  _active = true;
  let result: Promise<OnDeviceTranscriptResult>;

  try {
    const granted = await requestMicPermission();
    if (!granted) {
      _active = false;
      throw new VoiceCaptureError('mic-permission-denied', 'Microphone permission denied');
    }

    const lang = resolveRecognitionLocale(options?.lang);
    await assertOnDeviceRecognition(lang);

    _startedAt = Date.now();
    _latestPartial = '';
    _latestConfidence = -1;

    let resolveFinal: ((result: OnDeviceTranscriptResult) => void) | null = null;
    let rejectFinal: ((err: VoiceCaptureError) => void) | null = null;
    result = new Promise<OnDeviceTranscriptResult>((resolve, reject) => {
      resolveFinal = resolve;
      rejectFinal = reject;
    });

    _finalResolve = resolveFinal;
    _finalReject = rejectFinal;

    _listeners.push(
      ExpoSpeechRecognitionModule.addListener('result', (ev) => {
        const top = ev.results?.[0];
        if (!top) return;
        _latestPartial = top.transcript;
        _latestConfidence = top.confidence ?? -1;
        onPartial?.({ text: top.transcript, isFinal: ev.isFinal });
        if (ev.isFinal) {
          settleSuccess(top.transcript, top.confidence ?? -1);
        }
      }),
    );

    _listeners.push(
      ExpoSpeechRecognitionModule.addListener('end', () => {
        if (!_active) return;
        settleSuccess(_latestPartial, _latestConfidence);
      }),
    );

    _listeners.push(
      ExpoSpeechRecognitionModule.addListener('error', (ev) => {
        const map: Record<string, VoiceCaptureErrorCode> = {
          'not-allowed': 'mic-permission-denied',
          'service-not-allowed': 'on-device-recognition-unavailable',
          'language-not-supported': 'on-device-recognition-unavailable',
          aborted: 'aborted',
        };
        const code = map[ev.error] ?? 'recognition-error';
        settleError(new VoiceCaptureError(code, ev.message || ev.error, ev.error));
      }),
    );

    if (onMetering) {
      _listeners.push(
        ExpoSpeechRecognitionModule.addListener('volumechange', (ev) => {
          const normalized = Math.max(-160, Math.min(0, ev.value * 16 - 160));
          onMetering({ metering: normalized, durationMillis: Date.now() - _startedAt });
        }),
      );
    }

    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
      iosCategory: IOS_AUDIO_CATEGORY,
      volumeChangeEventOptions: onMetering ? { enabled: true, intervalMillis: 100 } : undefined,
    });

    startMaxDurationTimer(options?.maxDurationMs ?? MAX_LISTEN_MS);
  } catch (err) {
    _active = false;
    clearTimers();
    clearListeners();
    _finalResolve = null;
    _finalReject = null;
    if (err instanceof VoiceCaptureError) throw err;
    const msg = err instanceof Error ? err.message : 'Failed to start recognizer';
    throw new VoiceCaptureError('recognition-error', msg);
  }

  return { result };
}

function startMaxDurationTimer(maxDurationMs: number): void {
  if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0) return;
  _maxDurationTimer = setTimeout(() => {
    _maxDurationTimer = null;
    if (!_active) return;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // The grace timer below settles the capture either way.
    }
    _stopGraceTimer = setTimeout(() => {
      _stopGraceTimer = null;
      if (!_active) return;
      if (_latestPartial.trim()) {
        settleSuccess(_latestPartial, _latestConfidence);
        return;
      }
      settleError(
        new VoiceCaptureError(
          'max-duration-reached',
          'Listening stopped after a minute. Tap the microphone to start again.',
        ),
      );
    }, STOP_GRACE_MS);
  }, maxDurationMs);
}

export async function startCapture(
  onMetering?: MeteringCallback,
  onPartial?: PartialCallback,
  options?: VoiceCaptureOptions,
): Promise<OnDeviceTranscriptResult> {
  const session = await startCaptureSession(onMetering, onPartial, options);
  return session.result;
}

export async function stopCapture(): Promise<void> {
  if (!_active) return;
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    // Best-effort: error path will be surfaced via the error listener.
  }
}

export async function cancelCapture(): Promise<void> {
  if (!_active) return;
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // ignore
  }
  settleError(new VoiceCaptureError('aborted', 'Capture cancelled'));
}

export function getLatestPartial(): string {
  return _latestPartial;
}

/**
 * Transcribe a recording the user handed to the app, such as the Transcribe
 * App Intent's audio file. The recognizer reads the file directly; nothing is
 * captured from the microphone.
 */
export async function transcribeAudioFile(
  uri: string,
  options?: VoiceCaptureOptions,
): Promise<OnDeviceTranscriptResult> {
  if (!uri) throw new VoiceCaptureError('recognition-error', 'No audio file was provided.');
  if (_active) {
    throw new VoiceCaptureError('already-active', 'Voice capture already in progress');
  }
  _active = true;

  try {
    const lang = resolveRecognitionLocale(options?.lang);
    await assertOnDeviceRecognition(lang);
    _latestPartial = '';
    _latestConfidence = -1;
    _startedAt = Date.now();

    let resolveFinal: ((value: OnDeviceTranscriptResult) => void) | null = null;
    let rejectFinal: ((err: VoiceCaptureError) => void) | null = null;
    const result = new Promise<OnDeviceTranscriptResult>((resolve, reject) => {
      resolveFinal = resolve;
      rejectFinal = reject;
    });
    _finalResolve = resolveFinal;
    _finalReject = rejectFinal;

    _listeners.push(
      ExpoSpeechRecognitionModule.addListener('result', (ev) => {
        const top = ev.results?.[0];
        if (!top) return;
        _latestPartial = top.transcript;
        _latestConfidence = top.confidence ?? -1;
        if (ev.isFinal) settleSuccess(top.transcript, top.confidence ?? -1);
      }),
    );
    _listeners.push(
      ExpoSpeechRecognitionModule.addListener('end', () => {
        if (!_active) return;
        settleSuccess(_latestPartial, _latestConfidence);
      }),
    );
    _listeners.push(
      ExpoSpeechRecognitionModule.addListener('error', (ev) => {
        settleError(new VoiceCaptureError('recognition-error', ev.message || ev.error, ev.error));
      }),
    );

    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: false,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
      audioSource: { uri },
    });

    return await result;
  } catch (err) {
    _active = false;
    clearTimers();
    clearListeners();
    _finalResolve = null;
    _finalReject = null;
    if (err instanceof VoiceCaptureError) throw err;
    const msg = err instanceof Error ? err.message : 'The recording could not be transcribed.';
    throw new VoiceCaptureError('recognition-error', msg);
  }
}
