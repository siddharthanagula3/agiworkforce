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
  wakeWordAvailable: boolean;
  bargeInEnabled: boolean;
  bargeInSensitivity: number;
  vadAvailable: boolean;
  localSttAvailable: boolean;
  localSttModel: string | null;
  localTtsAvailable: boolean;
  localTtsVoice: string | null;
  systemDictationAvailable: boolean;
}

export interface WhisperModelInfo {
  size: string;
  filename: string;
  description: string;
  approximate_size_mb: number;
  is_downloaded: boolean;
  path: string | null;
}

export interface PiperVoiceInfo {
  id: string;
  name: string;
  language: string;
  isDownloaded: boolean;
  modelPath: string | null;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
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

export async function voiceTtsSpeakLocal(
  text: string,
  rate?: number,
  volume?: number,
): Promise<void> {
  try {
    await invoke('voice_tts_speak_local', {
      text,
      ...(rate !== undefined ? { rate } : {}),
      ...(volume !== undefined ? { volume } : {}),
    });
  } catch (e) {
    throw new Error(`voiceTtsSpeakLocal failed: ${e}`);
  }
}

export async function voiceWakeEnable(): Promise<void> {
  try {
    await invoke('voice_wake_enable');
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

export async function voiceEnableBargeIn(enabled: boolean): Promise<boolean> {
  try {
    return (await invoke<boolean>('voice_enable_barge_in', { enabled })) ?? false;
  } catch (e) {
    throw new Error(`voiceEnableBargeIn failed: ${e}`);
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
