
import {
  startCaptureSession,
  stopCapture,
  cancelCapture,
  isCapturing,
  getLatestPartial,
  type VoiceInputMeteringEvent,
  type OnDeviceTranscriptResult,
} from './voiceInput';
export { VoiceCaptureError, type VoicePartialResult } from './voiceInput';

export type VoiceMeteringEvent = VoiceInputMeteringEvent & {
  isDoneRecording: boolean;
};

export interface TranscriptionResult {
  text: string;
}

type MeteringCallback = (event: VoiceMeteringEvent) => void;

let _lastResult: OnDeviceTranscriptResult | null = null;
let _activeCapturePromise: Promise<OnDeviceTranscriptResult> | null = null;

/** Re-exported for callers that wired permission UX into the chat input. */
export async function checkPermission(): Promise<boolean> {
  const { requestMicPermission } = await import('./voiceInput');
  return requestMicPermission();
}

export async function startRecording(onMetering?: MeteringCallback): Promise<void> {
  if (_activeCapturePromise) {
    throw new Error('Recording already in progress');
  }
  _lastResult = null;
  const meteringAdapter = onMetering
    ? (ev: VoiceInputMeteringEvent) =>
        onMetering({
          metering: ev.metering,
          durationMillis: ev.durationMillis,
          isDoneRecording: false,
        })
    : undefined;

  const session = await startCaptureSession(meteringAdapter);
  const capturePromise: Promise<OnDeviceTranscriptResult> = session.result.then((result) => {
    _lastResult = result;
    return result;
  });
  _activeCapturePromise = capturePromise;
  void capturePromise
    .finally(() => {
      if (_activeCapturePromise === capturePromise) {
        _activeCapturePromise = null;
      }
    })
    .catch(() => {
      // `.finally()` is transparent to rejection — it re-throws into the
      // promise it returns. cancelRecording()/a real recognition-error
      // reject `session.result` (and thus `capturePromise`) on every
      // long-press handoff and overlay cancel, not just rare failures; the
      // rejection itself is already handled by stopRecording/cancelRecording's
      // own awaits (or surfaced via transcribe's fallback). Swallow it here
      // too, matching the original `.catch()`-only guard this replaced —
      // otherwise this void'd, unawaited chain becomes an unhandled
      // promise rejection on every one of those paths.
    });
}

export async function stopRecording(): Promise<string> {
  if (!_activeCapturePromise) {
    if (_lastResult) return '';
    throw new Error('No recording in progress');
  }
  await stopCapture();
  try {
    await _activeCapturePromise;
  } finally {
    _activeCapturePromise = null;
  }
  return '';
}

export async function cancelRecording(): Promise<void> {
  if (!_activeCapturePromise) return;
  await cancelCapture();
  try {
    await _activeCapturePromise;
  } catch {
    // expected — cancelCapture rejects the inner promise
  }
  _activeCapturePromise = null;
  _lastResult = null;
}

export function isRecording(): boolean {
  return isCapturing();
}

export async function transcribe(_uri: string): Promise<TranscriptionResult> {
  void _uri;
  if (_lastResult) {
    return { text: _lastResult.text };
  }
  return { text: getLatestPartial() };
}

