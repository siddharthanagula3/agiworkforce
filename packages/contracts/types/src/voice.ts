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

export type VoiceProvider =
  | 'deepgram'
  | 'whisper'
  | 'local-whisper'
  | 'openai'
  | 'web-speech'
  | 'browser'
  | 'system';

export interface VoiceConfig {
  provider: VoiceProvider;
  language?: string;
  model?: string;
  sampleRate?: number;
  channels?: number;
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
  durationMs?: number;
  provider?: string;
}

export interface VoiceState {
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  lastTranscription: TranscriptionResult | null;
}

export interface VoiceMeteringEvent {
  metering: number;
  durationMillis: number;
  isDoneRecording: boolean;
}
