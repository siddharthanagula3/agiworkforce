/**
 * Shared voice types for the AGI Workforce platform.
 *
 * These types provide a unified interface for voice input across all surfaces:
 * - Desktop (Deepgram/Whisper via Rust, push-to-talk)
 * - Mobile (expo-av recording + server transcription)
 * - Chrome Extension (Web Speech API)
 *
 * @module voice
 * @packageDocumentation
 */

/**
 * Voice/transcription provider identifier.
 *
 * - `deepgram` — Deepgram Nova API (desktop + mobile direct)
 * - `whisper` — OpenAI Whisper (cloud, via Rust backend or API gateway)
 * - `local-whisper` — Local Whisper model (via Rust backend)
 * - `openai` — OpenAI audio API
 * - `web-speech` / `browser` — Browser Web Speech API (chrome extension, desktop fallback)
 * - `system` — Platform-native speech recognition (expo-speech on mobile, OS-level on desktop)
 */
export type VoiceProvider =
  | 'deepgram'
  | 'whisper'
  | 'local-whisper'
  | 'openai'
  | 'web-speech'
  | 'browser'
  | 'system';

/**
 * Configuration for a voice input session.
 */
export interface VoiceConfig {
  /** Which transcription provider to use */
  provider: VoiceProvider;
  /** BCP 47 language code (e.g., 'en-US', 'es', 'fr') */
  language?: string;
  /** Provider-specific model identifier (e.g., 'nova-3', 'whisper-1') */
  model?: string;
  /** Audio sample rate in Hz */
  sampleRate?: number;
  /** Number of audio channels */
  channels?: number;
}

/**
 * Result of a completed transcription.
 *
 * All surfaces produce this shape after audio has been transcribed,
 * regardless of whether the transcription happened locally (Web Speech API),
 * on the Rust backend (Whisper/Deepgram), or via a cloud API.
 */
export interface TranscriptionResult {
  /** The transcribed text */
  text: string;
  /** Confidence score from 0.0 to 1.0 (not all providers supply this) */
  confidence?: number;
  /** Detected or configured language code */
  language?: string;
  /** Duration of the audio that was transcribed, in milliseconds */
  durationMs?: number;
  /** Which provider performed the transcription */
  provider?: string;
}

/**
 * Unified voice input state.
 *
 * Represents the current state of voice recording and transcription
 * on any surface. UI components can consume this shape without knowing
 * which platform they are running on.
 */
export interface VoiceState {
  /** Whether audio is currently being recorded from the microphone */
  isRecording: boolean;
  /** Whether recorded audio is being sent for transcription */
  isTranscribing: boolean;
  /** Error message from the most recent operation, or null */
  error: string | null;
  /** The most recent transcription result, or null if none yet */
  lastTranscription: TranscriptionResult | null;
}

/** Voice metering event data */
export interface VoiceMeteringEvent {
  metering: number;
  durationMillis: number;
  isDoneRecording: boolean;
}
