// AUDIT-FIX: STT-WIRE
/**
 * Voice service — thin facade over services/voiceInput.ts (on-device STT).
 *
 * STB-22: the cloud Deepgram helpers that used to live here were removed; see
 * the note further down. Nothing in this module performs network I/O now — all
 * transcription is on-device via `./voiceInput`.
 */

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

// Re-exports used by the rest of the app under the legacy names.
export type VoiceMeteringEvent = VoiceInputMeteringEvent & {
  /** Always false here — recognition completion is delivered via the on-device callback. */
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

/**
 * Start on-device recording + recognition. The optional `onMetering` callback
 * receives a synthetic VoiceMeteringEvent on each volume sample so the existing
 * RecordingOverlay UI keeps working without code changes.
 */
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

  // await startCaptureSession so that permission / availability errors (thrown
  // before the recognizer starts) propagate as rejections on startRecording()
  // itself — fail-closed. The returned { result } promise resolves only when
  // the user stops speaking; store it so stopRecording / cancelRecording can
  // await it.
  const session = await startCaptureSession(meteringAdapter);
  const capturePromise: Promise<OnDeviceTranscriptResult> = session.result.then((result) => {
    _lastResult = result;
    return result;
  });
  _activeCapturePromise = capturePromise;
  void capturePromise
    .finally(() => {
      // Clear the "in progress" guard on BOTH completion paths. The
      // recognizer is started with `continuous: false`, so it stops itself
      // (this promise resolves) after a few seconds of silence WITHOUT
      // stopRecording() or cancelRecording() ever being called — that
      // natural-stop path is the normal case, not an edge case. Previously
      // only the rejection path cleared this guard, so a natural stop left
      // `_activeCapturePromise` permanently non-null and every subsequent
      // mic tap anywhere in the app threw "Recording already in progress"
      // until the app was force-quit. Guard against clearing a newer
      // session's promise in case one has already started by the time this
      // settles.
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

/**
 * Stop recording and return the recognized transcript URI placeholder.
 *
 * Legacy callers expected a file URI for upload. With on-device STT there's
 * no audio file to upload — the transcript is already available. We return
 * an empty string for compatibility; `transcribe()` consults the in-memory
 * result instead.
 */
export async function stopRecording(): Promise<string> {
  if (!_activeCapturePromise) {
    // The recognizer may have already stopped itself (natural silence
    // timeout — `continuous: false`) before this explicit stop arrived; the
    // UI has no live signal for that (see `VoiceMeteringEvent.isDoneRecording`
    // above), so a tap-to-stop reliably lands here in that case. The
    // natural-completion path in startRecording() already cleared this
    // guard, but a valid, not-yet-consumed transcript is sitting in
    // `_lastResult` — return normally so the caller's usual transcribe()
    // follow-up still delivers it, instead of throwing and silently
    // dropping a perfectly good transcript behind a spurious error.
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

/** Cancel an in-progress recording without producing a transcript. */
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

/** Mirror of the legacy isRecording() helper. */
export function isRecording(): boolean {
  return isCapturing();
}

/**
 * Return the transcript from the just-finished on-device recognition.
 * The `uri` argument is ignored — kept for API compatibility.
 */
export async function transcribe(_uri: string): Promise<TranscriptionResult> {
  void _uri;
  if (_lastResult) {
    return { text: _lastResult.text };
  }
  return { text: getLatestPartial() };
}

// ---------------------------------------------------------------------------
// STB-22: the cloud voice helpers were removed.
//
// `getDeepgramEphemeralToken()` POSTed to `${API_URL}/api/v1/voice/token`, a
// route that has never existed on the Next.js app or the Express api-gateway.
// The real voice surface is `/api/voice/transcribe` (server-side transcription)
// plus `/api/voice/health`, which keeps the provider key server-side by never
// minting a client token at all. `transcribeWithDeepgram()` existed only to
// consume that token. Both had zero callers.
//
// Re-enabling cloud transcription means calling `/api/voice/transcribe`, not
// resurrecting a client-held provider credential.
// ---------------------------------------------------------------------------
