import { invoke } from '../lib/tauri-mock';

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
  systemDictationAvailable: boolean;
}

export interface TtsVoice {
  id: string;
  name: string;
  language: string;
}

export interface TtsConfig {
  provider: string;
  /** @deprecated API keys should be managed via SecretManager on the Rust side. Do not pass keys through frontend code. */
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
  /** @deprecated API keys should be managed via SecretManager on the Rust side. Do not pass keys through frontend code. */
  apiKey?: string;
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

export async function voiceTranscribeFile(audioPath: string): Promise<VoiceTranscription> {
  try {
    return await invoke<VoiceTranscription>('voice_transcribe_file', { audioPath });
  } catch (e) {
    throw new Error(`voiceTranscribeFile failed: ${e}`);
  }
}

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

export async function voiceGetSettings(): Promise<VoiceSettings> {
  try {
    return await invoke<VoiceSettings>('voice_get_settings');
  } catch (e) {
    throw new Error(`voiceGetSettings failed: ${e}`);
  }
}

export async function voiceCheckLocalWhisper(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_check_local_whisper')) ?? false;
  } catch (e) {
    throw new Error(`voiceCheckLocalWhisper failed: ${e}`);
  }
}

export async function voiceGetCapabilities(): Promise<VoiceCapabilities> {
  try {
    return await invoke<VoiceCapabilities>('voice_get_capabilities');
  } catch (e) {
    throw new Error(`voiceGetCapabilities failed: ${e}`);
  }
}

export async function voiceTtsSpeak(text: string): Promise<void> {
  try {
    await invoke('voice_tts_speak', { text });
  } catch (e) {
    throw new Error(`voiceTtsSpeak failed: ${e}`);
  }
}

export async function voiceTtsSpeakWithBargeIn(text: string): Promise<void> {
  try {
    await invoke('voice_tts_speak_with_barge_in', { text });
  } catch (e) {
    throw new Error(`voiceTtsSpeakWithBargeIn failed: ${e}`);
  }
}

export async function voiceTtsStop(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_tts_stop')) ?? false;
  } catch (e) {
    throw new Error(`voiceTtsStop failed: ${e}`);
  }
}

export async function voiceTtsIsPlaying(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_tts_is_playing')) ?? false;
  } catch (e) {
    throw new Error(`voiceTtsIsPlaying failed: ${e}`);
  }
}

export async function voiceTtsListVoices(): Promise<TtsVoice[]> {
  try {
    return (await invoke<TtsVoice[]>('voice_tts_list_voices')) ?? [];
  } catch (e) {
    throw new Error(`voiceTtsListVoices failed: ${e}`);
  }
}

export async function voiceTtsConfigure(config: TtsConfig): Promise<void> {
  try {
    await invoke('voice_tts_configure', { config });
  } catch (e) {
    throw new Error(`voiceTtsConfigure failed: ${e}`);
  }
}

export async function voiceTtsSpeakLocal(
  text: string,
  rate?: number,
  volume?: number,
): Promise<number[]> {
  try {
    return (
      (await invoke<number[]>('voice_tts_speak_local', {
        text,
        ...(rate !== undefined ? { rate } : {}),
        ...(volume !== undefined ? { volume } : {}),
      })) ?? []
    );
  } catch (e) {
    throw new Error(`voiceTtsSpeakLocal failed: ${e}`);
  }
}

export async function voiceWakeEnable(config?: WakeWordConfig): Promise<void> {
  try {
    await invoke('voice_wake_enable', {
      ...(config ? { config } : {}),
    });
  } catch (e) {
    throw new Error(`voiceWakeEnable failed: ${e}`);
  }
}

export async function voiceWakeDisable(): Promise<void> {
  try {
    await invoke('voice_wake_disable');
  } catch (e) {
    throw new Error(`voiceWakeDisable failed: ${e}`);
  }
}

export async function voiceWakeStatus(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_wake_status')) ?? false;
  } catch (e) {
    throw new Error(`voiceWakeStatus failed: ${e}`);
  }
}

export async function voiceWakeConfigure(config: WakeWordConfig): Promise<void> {
  try {
    await invoke('voice_wake_configure', { config });
  } catch (e) {
    throw new Error(`voiceWakeConfigure failed: ${e}`);
  }
}

export async function voicePttConfigure(config: PttConfig): Promise<void> {
  try {
    await invoke('voice_ptt_configure', { config });
  } catch (e) {
    throw new Error(`voicePttConfigure failed: ${e}`);
  }
}

export async function voicePttState(): Promise<string> {
  try {
    return (await invoke<string>('voice_ptt_state')) ?? 'idle';
  } catch (e) {
    throw new Error(`voicePttState failed: ${e}`);
  }
}

export async function voicePttKeyDown(): Promise<void> {
  try {
    await invoke('voice_ptt_key_down');
  } catch (e) {
    throw new Error(`voicePttKeyDown failed: ${e}`);
  }
}

export async function voicePttKeyUp(): Promise<number | null> {
  try {
    return (await invoke<number | null>('voice_ptt_key_up')) ?? null;
  } catch (e) {
    throw new Error(`voicePttKeyUp failed: ${e}`);
  }
}

export async function voiceStartGlobalPtt(accelerator: string): Promise<void> {
  try {
    await invoke('voice_start_global_ptt', { accelerator });
  } catch (e) {
    throw new Error(`voiceStartGlobalPtt failed: ${e}`);
  }
}

export async function voiceStopGlobalPtt(): Promise<void> {
  try {
    await invoke('voice_stop_global_ptt');
  } catch (e) {
    throw new Error(`voiceStopGlobalPtt failed: ${e}`);
  }
}

export async function voiceInjectText(text: string): Promise<void> {
  try {
    await invoke('voice_inject_text', { text });
  } catch (e) {
    throw new Error(`voiceInjectText failed: ${e}`);
  }
}

export async function voiceDeepgramConfigure(config: DeepgramConfig): Promise<void> {
  try {
    await invoke('voice_deepgram_configure', { config });
  } catch (e) {
    throw new Error(`voiceDeepgramConfigure failed: ${e}`);
  }
}

export async function voiceStartDeepgramStream(): Promise<void> {
  try {
    await invoke('voice_start_deepgram_stream');
  } catch (e) {
    throw new Error(`voiceStartDeepgramStream failed: ${e}`);
  }
}

export async function voiceStopDeepgramStream(): Promise<DeepgramStreamingStats | null> {
  try {
    return (await invoke<DeepgramStreamingStats | null>('voice_stop_deepgram_stream')) ?? null;
  } catch (e) {
    throw new Error(`voiceStopDeepgramStream failed: ${e}`);
  }
}

export async function voiceDeepgramSendAudio(audioData: number[]): Promise<void> {
  try {
    await invoke('voice_deepgram_send_audio', { audioData });
  } catch (e) {
    throw new Error(`voiceDeepgramSendAudio failed: ${e}`);
  }
}

export async function voiceDeepgramStatus(): Promise<DeepgramStreamStatus> {
  try {
    return await invoke<DeepgramStreamStatus>('voice_deepgram_status');
  } catch (e) {
    throw new Error(`voiceDeepgramStatus failed: ${e}`);
  }
}

export async function voiceConvertAudioToPcm(samples: number[]): Promise<number[]> {
  try {
    return (await invoke<number[]>('voice_convert_audio_to_pcm', { samples })) ?? [];
  } catch (e) {
    throw new Error(`voiceConvertAudioToPcm failed: ${e}`);
  }
}

export async function voiceEnableBargeIn(enabled: boolean): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_enable_barge_in', { enabled })) ?? false;
  } catch (e) {
    throw new Error(`voiceEnableBargeIn failed: ${e}`);
  }
}

export async function voiceSetBargeInSensitivity(sensitivity: number): Promise<number> {
  try {
    return (await invoke<number>('voice_set_barge_in_sensitivity', { sensitivity })) ?? 0.5;
  } catch (e) {
    throw new Error(`voiceSetBargeInSensitivity failed: ${e}`);
  }
}

export async function voiceGetBargeInStatus(): Promise<BargeInStatus> {
  try {
    return await invoke<BargeInStatus>('voice_get_barge_in_status');
  } catch (e) {
    throw new Error(`voiceGetBargeInStatus failed: ${e}`);
  }
}

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

export async function voiceStartBargeInMonitoring(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_start_barge_in_monitoring')) ?? false;
  } catch (e) {
    throw new Error(`voiceStartBargeInMonitoring failed: ${e}`);
  }
}

export async function voiceStopBargeInMonitoring(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_stop_barge_in_monitoring')) ?? false;
  } catch (e) {
    throw new Error(`voiceStopBargeInMonitoring failed: ${e}`);
  }
}

export async function speechStartRecording(
  provider: string = 'cloud',
  device?: string | null,
): Promise<void> {
  try {
    await invoke('speech_start_recording', { provider, device: device ?? null });
  } catch (e) {
    throw new Error(`speechStartRecording failed: ${e}`);
  }
}

export async function speechCancelRecording(): Promise<void> {
  try {
    await invoke('speech_cancel_recording');
  } catch (e) {
    throw new Error(`speechCancelRecording failed: ${e}`);
  }
}

export interface DictationInputDevice {
  name: string;
  isDefault: boolean;
  sampleRate: number | null;
  channels: number | null;
}

export async function dictationListInputDevices(): Promise<DictationInputDevice[]> {
  try {
    return await invoke<DictationInputDevice[]>('dictation_list_input_devices');
  } catch (e) {
    throw new Error(`dictationListInputDevices failed: ${e}`);
  }
}

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

export async function voiceDownloadWhisperModel(modelSize: string): Promise<string> {
  try {
    return (await invoke<string>('voice_download_whisper_model', { modelSize })) ?? '';
  } catch (e) {
    throw new Error(`voiceDownloadWhisperModel failed: ${e}`);
  }
}

export async function voiceListWhisperModels(): Promise<WhisperModelInfo[]> {
  try {
    return (await invoke<WhisperModelInfo[]>('voice_list_whisper_models')) ?? [];
  } catch (e) {
    throw new Error(`voiceListWhisperModels failed: ${e}`);
  }
}

export async function voiceSetWhisperModel(modelSize: string): Promise<void> {
  try {
    await invoke('voice_set_whisper_model', { modelSize });
  } catch (e) {
    throw new Error(`voiceSetWhisperModel failed: ${e}`);
  }
}

export async function voiceDeleteWhisperModel(modelSize: string): Promise<void> {
  try {
    await invoke('voice_delete_whisper_model', { modelSize });
  } catch (e) {
    throw new Error(`voiceDeleteWhisperModel failed: ${e}`);
  }
}

export async function voiceDownloadPiperVoice(voiceId: string): Promise<string> {
  try {
    return (await invoke<string>('voice_download_piper_voice', { voiceId })) ?? '';
  } catch (e) {
    throw new Error(`voiceDownloadPiperVoice failed: ${e}`);
  }
}

export async function voiceListPiperVoices(): Promise<PiperVoiceInfo[]> {
  try {
    return (await invoke<PiperVoiceInfo[]>('voice_list_piper_voices')) ?? [];
  } catch (e) {
    throw new Error(`voiceListPiperVoices failed: ${e}`);
  }
}

export async function voiceSetPiperVoice(voiceId: string): Promise<void> {
  try {
    await invoke('voice_set_piper_voice', { voiceId });
  } catch (e) {
    throw new Error(`voiceSetPiperVoice failed: ${e}`);
  }
}

export async function voiceDeletePiperVoice(voiceId: string): Promise<void> {
  try {
    await invoke('voice_delete_piper_voice', { voiceId });
  } catch (e) {
    throw new Error(`voiceDeletePiperVoice failed: ${e}`);
  }
}

export async function voiceDownloadPiperBinary(): Promise<string> {
  try {
    return (await invoke<string>('voice_download_piper_binary')) ?? '';
  } catch (e) {
    throw new Error(`voiceDownloadPiperBinary failed: ${e}`);
  }
}

export async function voiceCheckPiperBinary(): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_check_piper_binary')) ?? false;
  } catch (e) {
    throw new Error(`voiceCheckPiperBinary failed: ${e}`);
  }
}

export async function voiceListLocalModels(): Promise<LocalModelsInfo> {
  try {
    return await invoke<LocalModelsInfo>('voice_list_local_models');
  } catch (e) {
    throw new Error(`voiceListLocalModels failed: ${e}`);
  }
}

export const VoiceClient = {
  transcribeFile: voiceTranscribeFile,
  transcribeBlob: voiceTranscribeBlob,
  transcribeLocal: voiceTranscribeLocal,
  configure: voiceConfigure,
  getSettings: voiceGetSettings,
  checkLocalWhisper: voiceCheckLocalWhisper,
  getCapabilities: voiceGetCapabilities,
  ttsSpeak: voiceTtsSpeak,
  ttsSpeakWithBargeIn: voiceTtsSpeakWithBargeIn,
  ttsStop: voiceTtsStop,
  ttsIsPlaying: voiceTtsIsPlaying,
  ttsListVoices: voiceTtsListVoices,
  ttsConfigure: voiceTtsConfigure,
  ttsSpeakLocal: voiceTtsSpeakLocal,
  wakeEnable: voiceWakeEnable,
  wakeDisable: voiceWakeDisable,
  wakeStatus: voiceWakeStatus,
  wakeConfigure: voiceWakeConfigure,
  pttConfigure: voicePttConfigure,
  pttState: voicePttState,
  pttKeyDown: voicePttKeyDown,
  pttKeyUp: voicePttKeyUp,
  startGlobalPtt: voiceStartGlobalPtt,
  stopGlobalPtt: voiceStopGlobalPtt,
  injectText: voiceInjectText,
  deepgramConfigure: voiceDeepgramConfigure,
  startDeepgramStream: voiceStartDeepgramStream,
  stopDeepgramStream: voiceStopDeepgramStream,
  deepgramSendAudio: voiceDeepgramSendAudio,
  deepgramStatus: voiceDeepgramStatus,
  convertAudioToPcm: voiceConvertAudioToPcm,
  enableBargeIn: voiceEnableBargeIn,
  setBargeInSensitivity: voiceSetBargeInSensitivity,
  getBargeInStatus: voiceGetBargeInStatus,
  configureBargeIn: voiceConfigureBargeIn,
  startBargeInMonitoring: voiceStartBargeInMonitoring,
  stopBargeInMonitoring: voiceStopBargeInMonitoring,
  startRecording: speechStartRecording,
  stopAndTranscribe: speechStopAndTranscribe,
  downloadWhisperModel: voiceDownloadWhisperModel,
  listWhisperModels: voiceListWhisperModels,
  setWhisperModel: voiceSetWhisperModel,
  deleteWhisperModel: voiceDeleteWhisperModel,
  downloadPiperVoice: voiceDownloadPiperVoice,
  listPiperVoices: voiceListPiperVoices,
  setPiperVoice: voiceSetPiperVoice,
  deletePiperVoice: voiceDeletePiperVoice,
  downloadPiperBinary: voiceDownloadPiperBinary,
  checkPiperBinary: voiceCheckPiperBinary,
  listLocalModels: voiceListLocalModels,
} as const;
