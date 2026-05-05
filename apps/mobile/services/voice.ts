import { Audio, type AudioMode } from 'expo-av';
import { API_URL, TIMEOUTS } from '@/lib/constants';
import { supabase } from './supabase';

// CRIT-MOB-02 fix (2026-05-04): ephemeral Deepgram token endpoint.
// The backend mints a short-lived (<60s) Deepgram temp token scoped to a
// single usage. The master Deepgram key never leaves the server.
interface EphemeralTokenResponse {
  token: string;
  expiresAt: number; // unix ms
}

/**
 * Request a short-lived Deepgram token from the backend.
 * Valid for ~60 seconds. Use immediately for transcription.
 * Throws on network error or backend unavailability.
 */
export async function getDeepgramEphemeralToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const authToken = data.session?.access_token;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.DEFAULT);

  try {
    const response = await fetch(`${API_URL}/api/v1/voice/token`, {
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

/**
 * Voice recording and speech-to-text service.
 * Uses expo-av for recording and the API gateway Whisper endpoint for transcription.
 */

/** Recording quality preset for voice messages */
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

/** Audio mode for recording */
const RECORDING_MODE: Partial<AudioMode> = {
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  shouldDuckAndroid: true,
};

/** Audio mode for playback */
const PLAYBACK_MODE: Partial<AudioMode> = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  shouldDuckAndroid: true,
};

export interface TranscriptionResult {
  text: string;
}

export interface VoiceMeteringEvent {
  /** Metering level in dB (-160 to 0) */
  metering: number;
  /** Duration in milliseconds */
  durationMillis: number;
  /** Whether recording is complete */
  isDoneRecording: boolean;
}

type MeteringCallback = (event: VoiceMeteringEvent) => void;

let activeRecording: Audio.Recording | null = null;
let meteringInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Check and request microphone permission.
 * Returns true if permission is granted.
 */
export async function checkPermission(): Promise<boolean> {
  const { status: existingStatus } = await Audio.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Start audio recording.
 * Optionally provide a callback for metering updates (~60fps).
 * @throws if permission denied or recording already active
 */
export async function startRecording(onMetering?: MeteringCallback): Promise<void> {
  if (activeRecording) {
    throw new Error('Recording already in progress');
  }

  const permitted = await checkPermission();
  if (!permitted) {
    throw new Error('Microphone permission denied');
  }

  await Audio.setAudioModeAsync(RECORDING_MODE);

  const recording = new Audio.Recording();
  try {
    await recording.prepareToRecordAsync(RECORDING_OPTIONS);
    await recording.startAsync();
  } catch (error) {
    // Clean up the recording object if prepare or start fails
    clearMeteringInterval();
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }

  activeRecording = recording;

  // Metering polling (~15 fps is sufficient for smooth UI)
  if (onMetering) {
    meteringInterval = setInterval(async () => {
      if (!activeRecording) return;
      try {
        const status = await activeRecording.getStatusAsync();
        if (status.isRecording) {
          onMetering({
            metering: status.metering ?? -160,
            durationMillis: status.durationMillis,
            isDoneRecording: false,
          });
        }
      } catch {
        // Recording may have been stopped between check and status call
      }
    }, 67); // ~15fps
  }
}

/**
 * Stop recording and return the file URI.
 * @returns Local file URI of the recorded audio
 */
export async function stopRecording(): Promise<string> {
  if (!activeRecording) {
    throw new Error('No recording in progress');
  }

  clearMeteringInterval();

  const recording = activeRecording;
  activeRecording = null; // Clear before async ops to prevent stale reference

  await recording.stopAndUnloadAsync();
  await Audio.setAudioModeAsync(PLAYBACK_MODE);

  const uri = recording.getURI();

  if (!uri) {
    throw new Error('Recording failed: no URI returned');
  }

  return uri;
}

/**
 * Cancel the current recording without saving.
 */
export async function cancelRecording(): Promise<void> {
  if (!activeRecording) return;

  clearMeteringInterval();

  try {
    await activeRecording.stopAndUnloadAsync();
  } catch {
    // Ignore errors during cancel
  }

  await Audio.setAudioModeAsync(PLAYBACK_MODE);
  activeRecording = null;
}

/**
 * Check if a recording is currently in progress.
 */
export function isRecording(): boolean {
  return activeRecording !== null;
}

/**
 * Upload recorded audio to the Whisper transcription endpoint.
 * @param uri - Local file URI from stopRecording()
 * @returns Transcribed text
 */
export async function transcribe(uri: string): Promise<TranscriptionResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  // Build multipart form data
  // React Native's FormData accepts { uri, type, name } objects for file uploads.
  // The standard Blob type doesn't apply; cast to `any` for the RN-specific API.
  const formData = new FormData();
  const filePayload: { uri: string; type: string; name: string } = {
    uri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData.append('audio', filePayload as any);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.UPLOAD);

  try {
    const response = await fetch(`${API_URL}/api/voice/transcribe`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // Let fetch set Content-Type with boundary for multipart
      },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Transcription failed: HTTP ${response.status} — ${body}`);
    }

    const result = (await response.json()) as TranscriptionResult;
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Clean up metering interval */
function clearMeteringInterval() {
  if (meteringInterval) {
    clearInterval(meteringInterval);
    meteringInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Deepgram direct transcription (via server-issued ephemeral token)
// ---------------------------------------------------------------------------
const DEEPGRAM_ENDPOINT = 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true';

/**
 * Transcribe a local audio URI directly via Deepgram's pre-recorded API.
 * Used for hold-to-record PTT.
 *
 * CRIT-MOB-02 (2026-05-04): The caller must obtain an ephemeral token from
 * the backend via `getDeepgramEphemeralToken()` — never pass a long-lived API
 * key. The token is valid for ~60 seconds and cannot be used to mint further
 * tokens or access Deepgram's admin API.
 *
 * @param uri           - Local file URI (m4a) from stopRecording()
 * @param ephemeralToken - Short-lived Deepgram token from getDeepgramEphemeralToken()
 * @returns Transcript string (empty string on silence/failure)
 */
export async function transcribeWithDeepgram(uri: string, ephemeralToken: string): Promise<string> {
  const formData = new FormData();
  // React Native FormData accepts { uri, type, name } for file blobs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData.append('audio', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.UPLOAD);

  try {
    const response = await fetch(DEEPGRAM_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ephemeralToken}` },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Deepgram transcription failed (HTTP ${response.status})`);
    }

    const data = (await response.json()) as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{ transcript?: string }>;
        }>;
      };
    };

    return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '';
  } finally {
    clearTimeout(timeoutId);
  }
}
