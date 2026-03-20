/**
 * Voice API — TypeScript wrappers for all Rust voice commands.
 *
 * Covers: transcription, TTS, wake word, PTT, global PTT, Deepgram streaming,
 * barge-in detection, local Whisper/Piper model management, native speech recording.
 *
 * 47 Rust commands wired. All invoke() params use camelCase per Tauri IPC rules.
 */

import { invoke } from '../lib/tauri-mock';

// =============================================================================
// Interfaces — mirror Rust return types with camelCase fields
// =============================================================================

export interface VoiceTranscription {
  text: string;
  language: string | null;
  duration: number | null;
  confidence: number | null;
}

export interface VoiceSettings {
  provider: 'cloud' | 'webspeech' | 'local';
  model: string;
  language: string | null;
}

export interface VoiceCapabilities {
  ttsAvailable: boolean;
  ttsProvider: string;
  ttsPlaying: boolean;
  wakeWordEnabled: boolean;
  pttEnabled: boolean;
  pttHotkey: string;
  bargeInEnabled: boolean;
  bargeInSensitivity: number;
  vadAvailable: boolean;
  localSttAvailable: boolean;
  localSttModel: string | null;
  localTtsAvailable: boolean;
  localTtsVoice: string | null;
}

export interface TtsVoice {
  id: string;
  name: string;
  language: string;
}

export interface TtsConfig {
  provider: string;
  apiKey?: string;
  voice?: string;
  speed?: number;
  pitch?: number;
}

export interface WakeWordConfig {
  enabled: boolean;
  wakePhrase?: string;
  sensitivity?: number;
}

export interface PttConfig {
  enabled: boolean;
  hotkey: string;
}

export interface DeepgramConfig {
  apiKey: string;
  model: string;
  language: string;
  sampleRate: number;
  channels: number;
  interim: boolean;
  punctuation: boolean;
  smartFormatting: boolean;
}

export interface DeepgramStreamingStats {
  state: string;
  totalAudioBytes: number;
  totalTranscripts: number;
  startedAt: number;
}

export interface DeepgramStreamStatus {
  isStreaming: boolean;
  connectionState: string;
  stats: DeepgramStreamingStats | null;
}

export interface BargeInConfig {
  sensitivity: number;
  minSpeechMs: number;
  consecutiveFramesThreshold: number;
}

export interface BargeInStats {
  totalDetections: number;
  avgLatencyMs: number;
}

export interface BargeInStatus {
  enabled: boolean;
  monitoringActive: boolean;
  sensitivity: number;
  minSpeechMs: number;
  stats: BargeInStats;
}

export interface SpeechTranscriptResult {
  text: string;
  confidence: number;
  language: string;
}

export interface WhisperModelInfo {
  size: string;
  downloaded: boolean;
  sizeBytes: number;
  modelPath: string | null;
}

export interface PiperVoiceInfo {
  id: string;
  name: string;
  language: string;
  isDownloaded: boolean;
  modelPath: string | null;
}

export interface LocalModelsInfo {
  whisperModels: WhisperModelInfo[];
  piperVoices: PiperVoiceInfo[];
  whisperModelsDir: string;
  piperModelsDir: string;
  piperBinaryAvailable: boolean;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
}

// =============================================================================
// 1. Transcription Commands (3)
// =============================================================================

/** Transcribe an audio file on disk via the configured provider. */
export async function voiceTranscribeFile(audioPath: string): Promise<VoiceTranscription> {
  try {
    return await invoke<VoiceTranscription>('voice_transcribe_file', { audioPath });
  } catch (e) {
    throw new Error(`voiceTranscribeFile failed: ${e}`);
  }
}

/** Transcribe an in-memory audio blob (sent as byte array). */
export async function voiceTranscribeBlob(
  audioData: number[],
  format: string,
  provider?: string,
  language?: string,
): Promise<VoiceTranscription> {
  try {
    return await invoke<VoiceTranscription>('voice_transcribe_blob', {
      audioData,
      format,
      ...(provider !== undefined ? { provider } : {}),
      ...(language !== undefined ? { language } : {}),
    });
  } catch (e) {
    throw new Error(`voiceTranscribeBlob failed: ${e}`);
  }
}

/** Transcribe using local Whisper directly (bypasses provider selection). */
export async function voiceTranscribeLocal(
  audioPath: string,
  language?: string,
): Promise<VoiceTranscription> {
  try {
    return await invoke<VoiceTranscription>('voice_transcribe_local', {
      audioPath,
      ...(language !== undefined ? { language } : {}),
    });
  } catch (e) {
    throw new Error(`voiceTranscribeLocal failed: ${e}`);
  }
}

// =============================================================================
// 2. Voice Configuration Commands (3)
// =============================================================================

/** Configure voice provider/model/language on the Rust backend. */
export async function voiceConfigure(
  provider?: string,
  model?: string,
  language?: string,
): Promise<void> {
  try {
    await invoke('voice_configure', {
      ...(provider !== undefined ? { provider } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(language !== undefined ? { language } : {}),
    });
  } catch (e) {
    throw new Error(`voiceConfigure failed: ${e}`);
  }
}

/** Get current voice settings from backend. */
export async function voiceGetSettings(): Promise<VoiceSettings> {
  try {
    return await invoke<VoiceSettings>('voice_get_settings');
  } catch (e) {
    throw new Error(`voiceGetSettings failed: ${e}`);
  }
}

/** Check if local Whisper binary is available on the system. */
export async function voiceCheckLocalWhisper(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_check_local_whisper')) ?? false;
  } catch (e) {
    throw new Error(`voiceCheckLocalWhisper failed: ${e}`);
  }
}

// =============================================================================
// 3. Capabilities (1)
// =============================================================================

/** Get full voice capabilities (TTS, wake word, PTT, barge-in, local models). */
export async function voiceGetCapabilities(): Promise<VoiceCapabilities> {
  try {
    return await invoke<VoiceCapabilities>('voice_get_capabilities');
  } catch (e) {
    throw new Error(`voiceGetCapabilities failed: ${e}`);
  }
}

// =============================================================================
// 4. TTS Commands (7)
// =============================================================================

/** Speak text using the configured TTS provider. */
export async function voiceTtsSpeak(text: string): Promise<void> {
  try {
    await invoke('voice_tts_speak', { text });
  } catch (e) {
    throw new Error(`voiceTtsSpeak failed: ${e}`);
  }
}

/** Speak text with barge-in support (auto-interrupts if user speaks). */
export async function voiceTtsSpeakWithBargeIn(text: string): Promise<void> {
  try {
    await invoke('voice_tts_speak_with_barge_in', { text });
  } catch (e) {
    throw new Error(`voiceTtsSpeakWithBargeIn failed: ${e}`);
  }
}

/** Stop TTS playback. Returns true if something was stopped. */
export async function voiceTtsStop(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_tts_stop')) ?? false;
  } catch (e) {
    throw new Error(`voiceTtsStop failed: ${e}`);
  }
}

/** Check if TTS is currently playing. */
export async function voiceTtsIsPlaying(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_tts_is_playing')) ?? false;
  } catch (e) {
    throw new Error(`voiceTtsIsPlaying failed: ${e}`);
  }
}

/** List available TTS voices. */
export async function voiceTtsListVoices(): Promise<TtsVoice[]> {
  try {
    return (await invoke<TtsVoice[]>('voice_tts_list_voices')) ?? [];
  } catch (e) {
    throw new Error(`voiceTtsListVoices failed: ${e}`);
  }
}

/** Configure TTS provider and settings. */
export async function voiceTtsConfigure(config: TtsConfig): Promise<void> {
  try {
    await invoke('voice_tts_configure', { config });
  } catch (e) {
    throw new Error(`voiceTtsConfigure failed: ${e}`);
  }
}

/** Speak text using local Piper TTS. Returns synthesized audio samples. */
export async function voiceTtsSpeakLocal(
  text: string,
  rate?: number,
  volume?: number,
): Promise<number[]> {
  try {
    return (await invoke<number[]>('voice_tts_speak_local', {
      text,
      ...(rate !== undefined ? { rate } : {}),
      ...(volume !== undefined ? { volume } : {}),
    })) ?? [];
  } catch (e) {
    throw new Error(`voiceTtsSpeakLocal failed: ${e}`);
  }
}

// =============================================================================
// 5. Wake Word Commands (4)
// =============================================================================

/** Enable wake word detection with optional config. */
export async function voiceWakeEnable(config?: WakeWordConfig): Promise<void> {
  try {
    await invoke('voice_wake_enable', {
      ...(config ? { config } : {}),
    });
  } catch (e) {
    throw new Error(`voiceWakeEnable failed: ${e}`);
  }
}

/** Disable wake word detection. */
export async function voiceWakeDisable(): Promise<void> {
  try {
    await invoke('voice_wake_disable');
  } catch (e) {
    throw new Error(`voiceWakeDisable failed: ${e}`);
  }
}

/** Get wake word listening status. */
export async function voiceWakeStatus(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_wake_status')) ?? false;
  } catch (e) {
    throw new Error(`voiceWakeStatus failed: ${e}`);
  }
}

/** Configure wake word settings (phrase, sensitivity). */
export async function voiceWakeConfigure(config: WakeWordConfig): Promise<void> {
  try {
    await invoke('voice_wake_configure', { config });
  } catch (e) {
    throw new Error(`voiceWakeConfigure failed: ${e}`);
  }
}

// =============================================================================
// 6. Push-to-Talk Commands (4)
// =============================================================================

/** Configure push-to-talk settings. */
export async function voicePttConfigure(config: PttConfig): Promise<void> {
  try {
    await invoke('voice_ptt_configure', { config });
  } catch (e) {
    throw new Error(`voicePttConfigure failed: ${e}`);
  }
}

/** Get current PTT state (idle/recording). */
export async function voicePttState(): Promise<string> {
  try {
    return (await invoke<string>('voice_ptt_state')) ?? 'idle';
  } catch (e) {
    throw new Error(`voicePttState failed: ${e}`);
  }
}

/** Simulate PTT key down (begin recording). */
export async function voicePttKeyDown(): Promise<void> {
  try {
    await invoke('voice_ptt_key_down');
  } catch (e) {
    throw new Error(`voicePttKeyDown failed: ${e}`);
  }
}

/** Simulate PTT key up (end recording). Returns audio length or null. */
export async function voicePttKeyUp(): Promise<number | null> {
  try {
    return (await invoke<number | null>('voice_ptt_key_up')) ?? null;
  } catch (e) {
    throw new Error(`voicePttKeyUp failed: ${e}`);
  }
}

// =============================================================================
// 7. Global PTT Commands (3)
// =============================================================================

/** Start global fn-key PTT listener (rdev OS hook). */
export async function voiceStartGlobalPtt(): Promise<void> {
  try {
    await invoke('voice_start_global_ptt');
  } catch (e) {
    throw new Error(`voiceStartGlobalPtt failed: ${e}`);
  }
}

/** Stop global PTT listener. */
export async function voiceStopGlobalPtt(): Promise<void> {
  try {
    await invoke('voice_stop_global_ptt');
  } catch (e) {
    throw new Error(`voiceStopGlobalPtt failed: ${e}`);
  }
}

/** Inject text into the OS-focused input field via enigo. */
export async function voiceInjectText(text: string): Promise<void> {
  try {
    await invoke('voice_inject_text', { text });
  } catch (e) {
    throw new Error(`voiceInjectText failed: ${e}`);
  }
}

// =============================================================================
// 8. Deepgram Streaming Commands (5)
// =============================================================================

/** Configure Deepgram streaming settings (API key, model, etc.). */
export async function voiceDeepgramConfigure(config: DeepgramConfig): Promise<void> {
  try {
    await invoke('voice_deepgram_configure', { config });
  } catch (e) {
    throw new Error(`voiceDeepgramConfigure failed: ${e}`);
  }
}

/** Start Deepgram streaming transcription. Transcripts arrive as Tauri events. */
export async function voiceStartDeepgramStream(): Promise<void> {
  try {
    await invoke('voice_start_deepgram_stream');
  } catch (e) {
    throw new Error(`voiceStartDeepgramStream failed: ${e}`);
  }
}

/** Stop Deepgram streaming. Returns final stats. */
export async function voiceStopDeepgramStream(): Promise<DeepgramStreamingStats | null> {
  try {
    return (await invoke<DeepgramStreamingStats | null>('voice_stop_deepgram_stream')) ?? null;
  } catch (e) {
    throw new Error(`voiceStopDeepgramStream failed: ${e}`);
  }
}

/** Send audio data to active Deepgram stream. */
export async function voiceDeepgramSendAudio(audioData: number[]): Promise<void> {
  try {
    await invoke('voice_deepgram_send_audio', { audioData });
  } catch (e) {
    throw new Error(`voiceDeepgramSendAudio failed: ${e}`);
  }
}

/** Get Deepgram streaming status. */
export async function voiceDeepgramStatus(): Promise<DeepgramStreamStatus> {
  try {
    return await invoke<DeepgramStreamStatus>('voice_deepgram_status');
  } catch (e) {
    throw new Error(`voiceDeepgramStatus failed: ${e}`);
  }
}

// =============================================================================
// 9. Audio Conversion Utility (1)
// =============================================================================

/** Convert f32 audio samples to PCM 16-bit bytes for Deepgram. */
export async function voiceConvertAudioToPcm(samples: number[]): Promise<number[]> {
  try {
    return (await invoke<number[]>('voice_convert_audio_to_pcm', { samples })) ?? [];
  } catch (e) {
    throw new Error(`voiceConvertAudioToPcm failed: ${e}`);
  }
}

// =============================================================================
// 10. Barge-In Detection Commands (6)
// =============================================================================

/** Enable or disable barge-in detection globally. Returns new enabled state. */
export async function voiceEnableBargeIn(enabled: boolean): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_enable_barge_in', { enabled })) ?? false;
  } catch (e) {
    throw new Error(`voiceEnableBargeIn failed: ${e}`);
  }
}

/** Set barge-in sensitivity (0.0 - 1.0). Returns clamped value. */
export async function voiceSetBargeInSensitivity(sensitivity: number): Promise<number> {
  try {
    return (await invoke<number>('voice_set_barge_in_sensitivity', { sensitivity })) ?? 0.5;
  } catch (e) {
    throw new Error(`voiceSetBargeInSensitivity failed: ${e}`);
  }
}

/** Get barge-in detection status (enabled, monitoring, stats). */
export async function voiceGetBargeInStatus(): Promise<BargeInStatus> {
  try {
    return await invoke<BargeInStatus>('voice_get_barge_in_status');
  } catch (e) {
    throw new Error(`voiceGetBargeInStatus failed: ${e}`);
  }
}

/** Configure barge-in parameters (sensitivity, min speech ms, threshold). */
export async function voiceConfigureBargeIn(
  sensitivity?: number,
  minSpeechMs?: number,
  consecutiveFramesThreshold?: number,
): Promise<BargeInConfig> {
  try {
    return await invoke<BargeInConfig>('voice_configure_barge_in', {
      ...(sensitivity !== undefined ? { sensitivity } : {}),
      ...(minSpeechMs !== undefined ? { minSpeechMs } : {}),
      ...(consecutiveFramesThreshold !== undefined ? { consecutiveFramesThreshold } : {}),
    });
  } catch (e) {
    throw new Error(`voiceConfigureBargeIn failed: ${e}`);
  }
}

/** Start barge-in monitoring for current TTS playback. */
export async function voiceStartBargeInMonitoring(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_start_barge_in_monitoring')) ?? false;
  } catch (e) {
    throw new Error(`voiceStartBargeInMonitoring failed: ${e}`);
  }
}

/** Stop barge-in monitoring. */
export async function voiceStopBargeInMonitoring(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_stop_barge_in_monitoring')) ?? false;
  } catch (e) {
    throw new Error(`voiceStopBargeInMonitoring failed: ${e}`);
  }
}

// =============================================================================
// 11. Native Speech Recording — Wispr Flow (2)
// =============================================================================

/** Start native audio recording via cpal (OS-level microphone capture). */
export async function speechStartRecording(provider: string = 'cloud'): Promise<void> {
  try {
    await invoke('speech_start_recording', { provider });
  } catch (e) {
    throw new Error(`speechStartRecording failed: ${e}`);
  }
}

/** Stop native recording and return transcription result. */
export async function speechStopAndTranscribe(
  provider: string = 'cloud',
  language: string = 'en',
): Promise<SpeechTranscriptResult> {
  try {
    return await invoke<SpeechTranscriptResult>('speech_stop_and_transcribe', {
      provider,
      language,
    });
  } catch (e) {
    throw new Error(`speechStopAndTranscribe failed: ${e}`);
  }
}

// =============================================================================
// 12. Local Whisper STT Model Management (4)
// =============================================================================

/** Download a Whisper model for local STT. Emits voice:whisper_download_progress events. */
export async function voiceDownloadWhisperModel(modelSize: string): Promise<string> {
  try {
    return (await invoke<string>('voice_download_whisper_model', { modelSize })) ?? '';
  } catch (e) {
    throw new Error(`voiceDownloadWhisperModel failed: ${e}`);
  }
}

/** List available Whisper models (downloaded and available). */
export async function voiceListWhisperModels(): Promise<WhisperModelInfo[]> {
  try {
    return (await invoke<WhisperModelInfo[]>('voice_list_whisper_models')) ?? [];
  } catch (e) {
    throw new Error(`voiceListWhisperModels failed: ${e}`);
  }
}

/** Set the active Whisper model size. */
export async function voiceSetWhisperModel(modelSize: string): Promise<void> {
  try {
    await invoke('voice_set_whisper_model', { modelSize });
  } catch (e) {
    throw new Error(`voiceSetWhisperModel failed: ${e}`);
  }
}

/** Delete a downloaded Whisper model. */
export async function voiceDeleteWhisperModel(modelSize: string): Promise<void> {
  try {
    await invoke('voice_delete_whisper_model', { modelSize });
  } catch (e) {
    throw new Error(`voiceDeleteWhisperModel failed: ${e}`);
  }
}

// =============================================================================
// 13. Local Piper TTS Model Management (5)
// =============================================================================

/** Download a Piper voice. Emits voice:piper_download_progress events. */
export async function voiceDownloadPiperVoice(voiceId: string): Promise<string> {
  try {
    return (await invoke<string>('voice_download_piper_voice', { voiceId })) ?? '';
  } catch (e) {
    throw new Error(`voiceDownloadPiperVoice failed: ${e}`);
  }
}

/** List available Piper voices (downloaded and available). */
export async function voiceListPiperVoices(): Promise<PiperVoiceInfo[]> {
  try {
    return (await invoke<PiperVoiceInfo[]>('voice_list_piper_voices')) ?? [];
  } catch (e) {
    throw new Error(`voiceListPiperVoices failed: ${e}`);
  }
}

/** Set the active Piper voice. */
export async function voiceSetPiperVoice(voiceId: string): Promise<void> {
  try {
    await invoke('voice_set_piper_voice', { voiceId });
  } catch (e) {
    throw new Error(`voiceSetPiperVoice failed: ${e}`);
  }
}

/** Delete a downloaded Piper voice. */
export async function voiceDeletePiperVoice(voiceId: string): Promise<void> {
  try {
    await invoke('voice_delete_piper_voice', { voiceId });
  } catch (e) {
    throw new Error(`voiceDeletePiperVoice failed: ${e}`);
  }
}

/** Download the Piper binary for the current platform. */
export async function voiceDownloadPiperBinary(): Promise<string> {
  try {
    return (await invoke<string>('voice_download_piper_binary')) ?? '';
  } catch (e) {
    throw new Error(`voiceDownloadPiperBinary failed: ${e}`);
  }
}

// =============================================================================
// 14. Piper Binary Check (1)
// =============================================================================

/** Check if the Piper binary is available on the system. */
export async function voiceCheckPiperBinary(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_check_piper_binary')) ?? false;
  } catch (e) {
    throw new Error(`voiceCheckPiperBinary failed: ${e}`);
  }
}

// =============================================================================
// 15. Combined Local Models (1)
// =============================================================================

/** List all local voice models (Whisper + Piper) with download status. */
export async function voiceListLocalModels(): Promise<LocalModelsInfo> {
  try {
    return await invoke<LocalModelsInfo>('voice_list_local_models');
  } catch (e) {
    throw new Error(`voiceListLocalModels failed: ${e}`);
  }
}

// =============================================================================
// Convenience: VoiceClient class grouping all commands
// =============================================================================

export const VoiceClient = {
  // Transcription
  transcribeFile: voiceTranscribeFile,
  transcribeBlob: voiceTranscribeBlob,
  transcribeLocal: voiceTranscribeLocal,
  // Configuration
  configure: voiceConfigure,
  getSettings: voiceGetSettings,
  checkLocalWhisper: voiceCheckLocalWhisper,
  getCapabilities: voiceGetCapabilities,
  // TTS
  ttsSpeak: voiceTtsSpeak,
  ttsSpeakWithBargeIn: voiceTtsSpeakWithBargeIn,
  ttsStop: voiceTtsStop,
  ttsIsPlaying: voiceTtsIsPlaying,
  ttsListVoices: voiceTtsListVoices,
  ttsConfigure: voiceTtsConfigure,
  ttsSpeakLocal: voiceTtsSpeakLocal,
  // Wake word
  wakeEnable: voiceWakeEnable,
  wakeDisable: voiceWakeDisable,
  wakeStatus: voiceWakeStatus,
  wakeConfigure: voiceWakeConfigure,
  // PTT
  pttConfigure: voicePttConfigure,
  pttState: voicePttState,
  pttKeyDown: voicePttKeyDown,
  pttKeyUp: voicePttKeyUp,
  // Global PTT
  startGlobalPtt: voiceStartGlobalPtt,
  stopGlobalPtt: voiceStopGlobalPtt,
  injectText: voiceInjectText,
  // Deepgram
  deepgramConfigure: voiceDeepgramConfigure,
  startDeepgramStream: voiceStartDeepgramStream,
  stopDeepgramStream: voiceStopDeepgramStream,
  deepgramSendAudio: voiceDeepgramSendAudio,
  deepgramStatus: voiceDeepgramStatus,
  // Audio conversion
  convertAudioToPcm: voiceConvertAudioToPcm,
  // Barge-in
  enableBargeIn: voiceEnableBargeIn,
  setBargeInSensitivity: voiceSetBargeInSensitivity,
  getBargeInStatus: voiceGetBargeInStatus,
  configureBargeIn: voiceConfigureBargeIn,
  startBargeInMonitoring: voiceStartBargeInMonitoring,
  stopBargeInMonitoring: voiceStopBargeInMonitoring,
  // Native recording
  startRecording: speechStartRecording,
  stopAndTranscribe: speechStopAndTranscribe,
  // Whisper models
  downloadWhisperModel: voiceDownloadWhisperModel,
  listWhisperModels: voiceListWhisperModels,
  setWhisperModel: voiceSetWhisperModel,
  deleteWhisperModel: voiceDeleteWhisperModel,
  // Piper models
  downloadPiperVoice: voiceDownloadPiperVoice,
  listPiperVoices: voiceListPiperVoices,
  setPiperVoice: voiceSetPiperVoice,
  deletePiperVoice: voiceDeletePiperVoice,
  downloadPiperBinary: voiceDownloadPiperBinary,
  checkPiperBinary: voiceCheckPiperBinary,
  // Combined
  listLocalModels: voiceListLocalModels,
} as const;
