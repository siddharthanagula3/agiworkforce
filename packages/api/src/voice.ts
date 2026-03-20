/**
 * Voice API — typed wrappers for voice_* Tauri commands (STT, TTS, wake word, PTT, barge-in).
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface VoiceTranscription {
  text: string;
  confidence: number;
  language?: string;
  duration?: number;
}
export interface VoiceSettings {
  provider: string;
  model: string;
  language: string;
}
export interface VoiceCapabilities {
  stt: boolean;
  tts: boolean;
  localWhisper: boolean;
  deepgram: boolean;
  wakeWord: boolean;
  bargeIn: boolean;
}
export interface Voice {
  id: string;
  name: string;
  language: string;
}
export interface TtsConfig {
  provider?: string;
  voice?: string;
  speed?: number;
  pitch?: number;
}
export interface WakeWordConfig {
  keyword?: string;
  sensitivity?: number;
}
export interface PttConfig {
  key?: string;
  holdMode?: boolean;
}
export interface DeepgramConfig {
  apiKey?: string;
  model?: string;
  language?: string;
}
export interface DeepgramStreamingStats {
  duration: number;
  chunks: number;
  transcriptions: number;
}
export interface DeepgramStreamStatus {
  connected: boolean;
  streaming: boolean;
}
export interface WhisperModelInfo {
  size: string;
  downloaded: boolean;
  path?: string;
}
export interface PiperVoiceInfo {
  id: string;
  name: string;
  language: string;
  downloaded: boolean;
}
export interface LocalModelsInfo {
  whisper: WhisperModelInfo[];
  piper: PiperVoiceInfo[];
}
export interface BargeInStatus {
  enabled: boolean;
  monitoring: boolean;
  sensitivity: number;
}
export interface BargeInConfig {
  enabled?: boolean;
  sensitivity?: number;
  cooldownMs?: number;
}
export type TtsInterruptReason = 'user_speech' | 'manual' | 'new_response';

// ---- STT ----

export async function voiceTranscribeFile(audioPath: string): Promise<VoiceTranscription> {
  return command<VoiceTranscription>('voice_transcribe_file', { audioPath });
}
export async function voiceTranscribeBlob(
  audioData: number[],
  format: string,
  provider?: string,
  language?: string,
): Promise<VoiceTranscription> {
  return command<VoiceTranscription>('voice_transcribe_blob', {
    audioData,
    format,
    provider,
    language,
  });
}
export async function voiceConfigure(
  provider?: string,
  model?: string,
  language?: string,
): Promise<void> {
  return command<void>('voice_configure', { provider, model, language });
}
export async function voiceGetSettings(): Promise<VoiceSettings> {
  return command<VoiceSettings>('voice_get_settings');
}
export async function voiceCheckLocalWhisper(): Promise<boolean> {
  return command<boolean>('voice_check_local_whisper');
}
export async function voiceGetCapabilities(): Promise<VoiceCapabilities> {
  return command<VoiceCapabilities>('voice_get_capabilities');
}
export async function voiceTranscribeLocal(audioPath: string): Promise<VoiceTranscription> {
  return command<VoiceTranscription>('voice_transcribe_local', { audioPath });
}

// ---- TTS ----

export async function voiceTtsSpeak(text: string): Promise<void> {
  return command<void>('voice_tts_speak', { text });
}
export async function voiceTtsListVoices(): Promise<Voice[]> {
  return command<Voice[]>('voice_tts_list_voices');
}
export async function voiceTtsConfigure(config: TtsConfig): Promise<void> {
  return command<void>('voice_tts_configure', { config });
}
export async function voiceTtsSpeakLocal(text: string): Promise<void> {
  return command<void>('voice_tts_speak_local', { text });
}
export async function voiceCancelTts(): Promise<void> {
  return command<void>('voice_cancel_tts');
}
export async function voiceTtsInterruptPlayback(reason: TtsInterruptReason): Promise<void> {
  return command<void>('voice_tts_interrupt_playback', { reason });
}

// ---- Wake Word ----

export async function voiceWakeEnable(): Promise<void> {
  return command<void>('voice_wake_enable');
}
export async function voiceWakeDisable(): Promise<void> {
  return command<void>('voice_wake_disable');
}
export async function voiceWakeStatus(): Promise<boolean> {
  return command<boolean>('voice_wake_status');
}
export async function voiceWakeConfigure(config: WakeWordConfig): Promise<void> {
  return command<void>('voice_wake_configure', { config });
}

// ---- Push-to-Talk ----

export async function voicePttConfigure(config: PttConfig): Promise<void> {
  return command<void>('voice_ptt_configure', { config });
}
export async function voicePttState(): Promise<string> {
  return command<string>('voice_ptt_state');
}
export async function voicePttKeyDown(): Promise<void> {
  return command<void>('voice_ptt_key_down');
}
export async function voicePttKeyUp(): Promise<number | null> {
  return command<number | null>('voice_ptt_key_up');
}

// ---- Deepgram Streaming ----

export async function voiceDeepgramConfigure(config: DeepgramConfig): Promise<void> {
  return command<void>('voice_deepgram_configure', { config });
}
export async function voiceStartDeepgramStream(): Promise<void> {
  return command<void>('voice_start_deepgram_stream');
}
export async function voiceStopDeepgramStream(): Promise<DeepgramStreamingStats | null> {
  return command<DeepgramStreamingStats | null>('voice_stop_deepgram_stream');
}
export async function voiceDeepgramSendAudio(data: number[]): Promise<void> {
  return command<void>('voice_deepgram_send_audio', { data });
}
export async function voiceDeepgramStatus(): Promise<DeepgramStreamStatus> {
  return command<DeepgramStreamStatus>('voice_deepgram_status');
}

// ---- Local Models ----

export async function voiceConvertAudioToPcm(samples: number[]): Promise<number[]> {
  return command<number[]>('voice_convert_audio_to_pcm', { samples });
}
export async function voiceDownloadWhisperModel(modelSize: string): Promise<string> {
  return command<string>('voice_download_whisper_model', { modelSize });
}
export async function voiceListWhisperModels(): Promise<WhisperModelInfo[]> {
  return command<WhisperModelInfo[]>('voice_list_whisper_models');
}
export async function voiceSetWhisperModel(modelSize: string): Promise<void> {
  return command<void>('voice_set_whisper_model', { modelSize });
}
export async function voiceDeleteWhisperModel(modelSize: string): Promise<void> {
  return command<void>('voice_delete_whisper_model', { modelSize });
}
export async function voiceDownloadPiperVoice(voiceId: string): Promise<string> {
  return command<string>('voice_download_piper_voice', { voiceId });
}
export async function voiceListPiperVoices(): Promise<PiperVoiceInfo[]> {
  return command<PiperVoiceInfo[]>('voice_list_piper_voices');
}
export async function voiceSetPiperVoice(voiceId: string): Promise<void> {
  return command<void>('voice_set_piper_voice', { voiceId });
}
export async function voiceDeletePiperVoice(voiceId: string): Promise<void> {
  return command<void>('voice_delete_piper_voice', { voiceId });
}
export async function voiceDownloadPiperBinary(): Promise<string> {
  return command<string>('voice_download_piper_binary');
}
export async function voiceCheckPiperBinary(): Promise<boolean> {
  return command<boolean>('voice_check_piper_binary');
}
export async function voiceListLocalModels(): Promise<LocalModelsInfo> {
  return command<LocalModelsInfo>('voice_list_local_models');
}

// ---- Barge-In ----

export async function voiceEnableBargeIn(): Promise<boolean> {
  return command<boolean>('voice_enable_barge_in');
}
export async function voiceSetBargeInSensitivity(sensitivity: number): Promise<number> {
  return command<number>('voice_set_barge_in_sensitivity', { sensitivity });
}
export async function voiceGetBargeInStatus(): Promise<BargeInStatus> {
  return command<BargeInStatus>('voice_get_barge_in_status');
}
export async function voiceConfigureBargeIn(config: BargeInConfig): Promise<void> {
  return command<void>('voice_configure_barge_in', { config });
}
export async function voiceStartBargeInMonitoring(): Promise<void> {
  return command<void>('voice_start_barge_in_monitoring');
}
export async function voiceStopBargeInMonitoring(): Promise<void> {
  return command<void>('voice_stop_barge_in_monitoring');
}

// ---- Global PTT ----

export async function voiceStartGlobalPtt(): Promise<void> {
  return command<void>('voice_start_global_ptt');
}
export async function voiceStopGlobalPtt(): Promise<void> {
  return command<void>('voice_stop_global_ptt');
}
export async function voiceInjectText(text: string): Promise<void> {
  return command<void>('voice_inject_text', { text });
}
