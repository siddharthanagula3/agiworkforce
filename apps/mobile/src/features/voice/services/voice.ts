// AUDIT-FIX: STT-WIRE
/**
 * Voice service — thin facade over services/voiceInput.ts (on-device STT).
 *
 * The cloud Whisper + Deepgram helpers below are retained for v1.1 (cloud chat)
 * and gated behind FEATURES.cloudChat — they throw {@link CloudVoiceDisabledError}
 * in v1.
 */

import { Platform } from 'react-native';
import { API_URL, TIMEOUTS } from '@/lib/constants';
import { FEATURES } from '@/lib/v1FeatureFlags';
// Zero-leak: the ephemeral-token endpoint is OUR cloud (`${API_URL}/api/v1/voice/token`)
// → guardedFetch (Local mode blocks before network I/O, fail-closed). The Deepgram
// call below is a direct-to-provider host, so it stays on secureFetch (TLS pinning).
import { secureFetch } from '@/services/secureFetch';
import { guardedFetch } from '@/lib/egressGuard';
import { getAuthToken } from '@/services/authSession';
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

export class CloudVoiceDisabledError extends Error {
  constructor(feature: string) {
    super(`[voice] ${feature} requires FEATURES.cloudChat (v1.1+).`);
    this.name = 'CloudVoiceDisabledError';
  }
}

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
  _activeCapturePromise = session.result.then((result) => {
    _lastResult = result;
    return result;
  });
  _activeCapturePromise.catch(() => {
    // Errors after the session starts (recognition-error, aborted) are handled
    // by stopRecording / transcribe.
    _activeCapturePromise = null;
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
// Cloud paths (gated behind FEATURES.cloudChat — v1.1+)
// ---------------------------------------------------------------------------

interface EphemeralTokenResponse {
  token: string;
  expiresAt: number;
}

/**
 * Request a short-lived Deepgram token from the backend (cloud-only).
 * @throws CloudVoiceDisabledError when FEATURES.cloudChat is false.
 */
export async function getDeepgramEphemeralToken(): Promise<string> {
  if (!FEATURES.cloudChat) {
    throw new CloudVoiceDisabledError('getDeepgramEphemeralToken');
  }
  const authToken = await getAuthToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.DEFAULT);

  try {
    const response = await guardedFetch(`${API_URL}/api/v1/voice/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Voice token request failed: HTTP ${response.status} — ${body}`);
    }
    const result = (await response.json()) as EphemeralTokenResponse;
    return result.token;
  } finally {
    clearTimeout(timeoutId);
  }
}

const DEEPGRAM_ENDPOINT = 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true';

/**
 * Transcribe a local audio URI directly via Deepgram (cloud-only).
 * @throws CloudVoiceDisabledError when FEATURES.cloudChat is false.
 */
export async function transcribeWithDeepgram(uri: string, ephemeralToken: string): Promise<string> {
  if (!FEATURES.cloudChat) {
    throw new CloudVoiceDisabledError('transcribeWithDeepgram');
  }
  const formData = new FormData();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData.append('audio', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.UPLOAD);

  try {
    const response = await secureFetch(DEEPGRAM_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ephemeralToken}` },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Deepgram transcription failed (HTTP ${response.status})`);
    }
    const data = (await response.json()) as {
      results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
    };
    return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '';
  } finally {
    clearTimeout(timeoutId);
  }
}

// Suppress unused-platform warning until cloud paths re-enable Platform-specific logic.
void Platform;
