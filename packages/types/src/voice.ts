/**
 * Voice types for providers, configuration, and transcription.
 */

/** Supported voice providers */
export type VoiceProvider =
  | 'openai'
  | 'deepgram'
  | 'whisper'
  | 'local-whisper'
  | 'browser';

/** Voice configuration */
export interface VoiceConfig {
  provider: VoiceProvider;
  language?: string;
  model?: string;
  sampleRate?: number;
  channels?: number;
}

/** Result from a transcription operation */
export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
  durationMs?: number;
}

/** Voice metering event data */
export interface VoiceMeteringEvent {
  metering: number;
  durationMillis: number;
  isDoneRecording: boolean;
}
