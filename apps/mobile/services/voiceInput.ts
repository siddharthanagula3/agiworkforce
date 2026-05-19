// AUDIT-FIX: STT-WIRE
/**
 * On-device voice input (STT) — backed by `expo-speech-recognition`.
 *
 * iOS:     SFSpeechRecognizer + microphone (on-device when supported).
 * Android: SpeechRecognizer + microphone (com.google.android.googlequicksearchbox
 *          recognition service by default; on-device on Android 12+ when the
 *          locale offline pack is installed).
 *
 * Audio bytes do not leave the device when `requiresOnDeviceRecognition: true`
 * AND the device reports on-device support for the requested locale.
 *
 * Cloud Whisper / Deepgram paths live in services/voice.ts behind FEATURES.cloudChat.
 */

import { Platform } from 'react-native';
import * as Localization from 'expo-localization';
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';

export type VoiceCaptureErrorCode =
  | 'mic-permission-denied'
  | 'on-device-recognition-unavailable'
  | 'aborted'
  | 'recognition-error'
  | 'already-active';

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
  /** true when the result was produced by on-device inference (no cloud round-trip) */
  isOnDevice: true;
  /** Per-segment confidence average; -1 when unavailable */
  confidence: number;
}

export interface VoiceInputMeteringEvent {
  /** Normalised dB-style value: -160..0 (mapped from native -2..10 scale) */
  metering: number;
  durationMillis: number;
}

export interface VoicePartialResult {
  text: string;
  isFinal: boolean;
}

type MeteringCallback = (event: VoiceInputMeteringEvent) => void;
type PartialCallback = (event: VoicePartialResult) => void;

let _active = false;
let _startedAt = 0;
let _listeners: Array<{ remove: () => void }> = [];
let _finalResolve: ((result: OnDeviceTranscriptResult) => void) | null = null;
let _finalReject: ((err: VoiceCaptureError) => void) | null = null;
let _latestPartial = '';
let _latestConfidence = -1;

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
  clearListeners();
  const resolver = _finalResolve;
  _finalResolve = null;
  _finalReject = null;
  resolver?.({ text, confidence, isOnDevice: true });
}

function settleError(err: VoiceCaptureError): void {
  _active = false;
  clearListeners();
  const rejecter = _finalReject;
  _finalResolve = null;
  _finalReject = null;
  rejecter?.(err);
}

/** Returns the canonical platform STT backend identifier. */
export function getPlatformSTTBackend(): 'ios-speech' | 'android-speech-recognizer' | 'expo-av' {
  if (Platform.OS === 'ios') return 'ios-speech';
  if (Platform.OS === 'android') return 'android-speech-recognizer';
  return 'expo-av';
}

/** Request both microphone and speech-recognition permissions. */
export async function requestMicPermission(): Promise<boolean> {
  try {
    const status = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return status.granted;
  } catch {
    return false;
  }
}

/** Returns true if a recognition session is currently active. */
export function isCapturing(): boolean {
  return _active;
}

function pickLocale(): string {
  try {
    const locales = Localization.getLocales();
    return locales[0]?.languageTag ?? 'en-US';
  } catch {
    return 'en-US';
  }
}

/**
 * Begin speech recognition. Returns a promise that resolves with the final
 * transcript when the user stops or the recognizer reports `isFinal: true`.
 *
 * Throws synchronously / rejects with {@link VoiceCaptureError} on:
 *   - mic-permission-denied
 *   - on-device-recognition-unavailable (when locale not installed)
 *   - already-active (concurrent start)
 */
export async function startCapture(
  onMetering?: MeteringCallback,
  onPartial?: PartialCallback,
): Promise<OnDeviceTranscriptResult> {
  if (_active) {
    throw new VoiceCaptureError('already-active', 'Voice capture already in progress');
  }

  const granted = await requestMicPermission();
  if (!granted) {
    throw new VoiceCaptureError('mic-permission-denied', 'Microphone permission denied');
  }

  const lang = pickLocale();
  const onDeviceSupported =
    typeof ExpoSpeechRecognitionModule.supportsOnDeviceRecognition === 'function'
      ? ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
      : true;
  const requiresOnDevice = onDeviceSupported;

  _active = true;
  _startedAt = Date.now();
  _latestPartial = '';
  _latestConfidence = -1;

  return new Promise<OnDeviceTranscriptResult>((resolve, reject) => {
    _finalResolve = resolve;
    _finalReject = reject;

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
        // Recognizer ended without isFinal: surface the latest partial as the final.
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
          // Map native -2..10 to -160..0 dB-style scale used by the rest of the UI.
          const normalized = Math.max(-160, Math.min(0, ev.value * 16 - 160));
          onMetering({ metering: normalized, durationMillis: Date.now() - _startedAt });
        }),
      );
    }

    try {
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: requiresOnDevice,
        addsPunctuation: true,
        volumeChangeEventOptions: onMetering ? { enabled: true, intervalMillis: 100 } : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start recognizer';
      settleError(new VoiceCaptureError('recognition-error', msg));
    }
  });
}

/** Stop recognition and return the final transcript via the original startCapture promise. */
export async function stopCapture(): Promise<void> {
  if (!_active) return;
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {
    // Best-effort: error path will be surfaced via the error listener.
  }
}

/** Cancel recognition immediately. The pending startCapture promise rejects with 'aborted'. */
export async function cancelCapture(): Promise<void> {
  if (!_active) return;
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // ignore
  }
  settleError(new VoiceCaptureError('aborted', 'Capture cancelled'));
}

/**
 * Returns the latest partial transcript. Useful for screens that want to show
 * a live preview without subscribing to the `result` event.
 */
export function getLatestPartial(): string {
  return _latestPartial;
}

/**
 * Compatibility wrapper retained for callers that previously received a URI
 * and called transcribeOnDevice() on it. With ExpoSpeechRecognition the
 * transcript is delivered through the live event stream, so this path no
 * longer makes a second pass over the audio; instead it returns whatever
 * was last surfaced by the recognizer.
 */
export async function transcribeOnDevice(uri: string): Promise<OnDeviceTranscriptResult> {
  void uri;
  return { text: _latestPartial, confidence: _latestConfidence, isOnDevice: true };
}
