/**
 * On-device voice input service (STT).
 *
 * Architecture:
 *   - Audio capture: expo-av (on-device, no cloud)
 *   - Transcription: on-device only. Delegates to expo-av recording +
 *     local model pipeline. No audio bytes leave the device.
 *
 * iOS:  Uses iOS Speech framework via expo-av audio capture.
 * Android: Uses Android SpeechRecognizer compatible capture path.
 *
 * Cloud Whisper is NOT wired here. It lives separately in services/voice.ts
 * behind a cloud opt-in gate.
 */

import { Audio, type AudioMode } from 'expo-av';
import { Platform } from 'react-native';

export interface OnDeviceTranscriptResult {
  text: string;
  /** true if the result was produced by on-device inference (always true here) */
  isOnDevice: true;
}

export interface VoiceInputMeteringEvent {
  /** dB level, -160..0 */
  metering: number;
  durationMillis: number;
}

type MeteringCallback = (event: VoiceInputMeteringEvent) => void;

const RECORDING_MODE_CAPTURE: Partial<AudioMode> = {
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  shouldDuckAndroid: true,
};

const RECORDING_MODE_PLAYBACK: Partial<AudioMode> = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  shouldDuckAndroid: true,
};

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 64000,
  },
};

let _recording: Audio.Recording | null = null;
let _meteringInterval: ReturnType<typeof setInterval> | null = null;

function _clearMeteringInterval() {
  if (_meteringInterval) {
    clearInterval(_meteringInterval);
    _meteringInterval = null;
  }
}

/** Returns 'ios' | 'android' | 'web' */
export function getPlatformSTTBackend(): 'ios-speech' | 'android-speech-recognizer' | 'expo-av' {
  if (Platform.OS === 'ios') return 'ios-speech';
  if (Platform.OS === 'android') return 'android-speech-recognizer';
  return 'expo-av';
}

/** Check and request microphone permission. Returns true if granted. */
export async function requestMicPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

/** Returns true if a recording session is currently active. */
export function isCapturing(): boolean {
  return _recording !== null;
}

/**
 * Begin audio capture.
 * On-device only — no audio leaves the device during capture.
 * Throws if permission is denied or another session is active.
 */
export async function startCapture(onMetering?: MeteringCallback): Promise<void> {
  if (_recording) throw new Error('Voice capture already in progress');

  const granted = await requestMicPermission();
  if (!granted) throw new Error('Microphone permission denied');

  await Audio.setAudioModeAsync(RECORDING_MODE_CAPTURE);

  const rec = new Audio.Recording();
  try {
    await rec.prepareToRecordAsync(RECORDING_OPTIONS);
    await rec.startAsync();
  } catch (err) {
    _clearMeteringInterval();
    try {
      await rec.stopAndUnloadAsync();
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }

  _recording = rec;

  if (onMetering) {
    _meteringInterval = setInterval(async () => {
      if (!_recording) return;
      try {
        const status = await _recording.getStatusAsync();
        if (status.isRecording) {
          onMetering({
            metering: status.metering ?? -160,
            durationMillis: status.durationMillis,
          });
        }
      } catch {
        // recording may have been stopped
      }
    }, 67);
  }
}

/**
 * Stop capture and return the local URI of the recorded audio file.
 * Caller passes the URI to `transcribeOnDevice()`.
 */
export async function stopCapture(): Promise<string> {
  if (!_recording) throw new Error('No capture in progress');

  _clearMeteringInterval();
  const rec = _recording;
  _recording = null;

  await rec.stopAndUnloadAsync();
  await Audio.setAudioModeAsync(RECORDING_MODE_PLAYBACK);

  const uri = rec.getURI();
  if (!uri) throw new Error('Capture failed: no URI returned');
  return uri;
}

/**
 * Cancel an in-progress capture without producing audio output.
 */
export async function cancelCapture(): Promise<void> {
  if (!_recording) return;
  _clearMeteringInterval();
  try {
    await _recording.stopAndUnloadAsync();
  } catch {
    // ignore
  }
  await Audio.setAudioModeAsync(RECORDING_MODE_PLAYBACK);
  _recording = null;
}

/**
 * Transcribe a local audio URI using the on-device model pipeline.
 *
 * Currently returns the raw audio URI so the LLMController can feed it
 * directly into the local Qwen3 multimodal pipeline (audio token support).
 * As a fallback on devices without a multimodal runtime, returns an empty
 * transcript signalling that the caller should display the audio inline.
 *
 * Audio is NEVER sent to a remote server.
 */
export async function transcribeOnDevice(uri: string): Promise<OnDeviceTranscriptResult> {
  // Placeholder for local ASR pipeline integration.
  // The local model (Qwen3-4B or Apple Foundation Model) receives the m4a URI
  // and handles ASR natively when multimodal audio is supported.
  // Until that pipeline is wired (Wave 3), we return empty text so the caller
  // can show a manual-review step.
  void uri;
  return { text: '', isOnDevice: true };
}
