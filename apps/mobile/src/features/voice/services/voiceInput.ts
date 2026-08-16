
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
export async function startCaptureSession(
  onMetering?: MeteringCallback,
  onPartial?: PartialCallback,
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

    const lang = pickLocale();
    const onDeviceSupported =
      typeof ExpoSpeechRecognitionModule.supportsOnDeviceRecognition === 'function'
        ? ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
        : true;
    if (!onDeviceSupported) {
      _active = false;
      throw new VoiceCaptureError(
        'on-device-recognition-unavailable',
        'On-device voice recognition is not available on this device.',
      );
    }

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
      volumeChangeEventOptions: onMetering ? { enabled: true, intervalMillis: 100 } : undefined,
    });
  } catch (err) {
    _active = false;
    clearListeners();
    _finalResolve = null;
    _finalReject = null;
    if (err instanceof VoiceCaptureError) throw err;
    const msg = err instanceof Error ? err.message : 'Failed to start recognizer';
    throw new VoiceCaptureError('recognition-error', msg);
  }

  return { result };
}

export async function startCapture(
  onMetering?: MeteringCallback,
  onPartial?: PartialCallback,
): Promise<OnDeviceTranscriptResult> {
  const session = await startCaptureSession(onMetering, onPartial);
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

export async function transcribeOnDevice(uri: string): Promise<OnDeviceTranscriptResult> {
  void uri;
  return { text: _latestPartial, confidence: _latestConfidence, isOnDevice: true };
}
