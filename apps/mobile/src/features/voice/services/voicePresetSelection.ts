import { useSettingsStore } from '@/stores/settingsStore';
import {
  VOICE_PRESETS,
  findVoiceForPreset,
  type VoicePreset,
} from '@/src/features/voice/voicePresets';
import type { VoiceInfo } from '@/src/features/voice/services/tts';

export function applyVoicePreset(presetId: string, installedVoices: VoiceInfo[] | null): boolean {
  const preset = VOICE_PRESETS.find((item) => item.id === presetId);
  if (!preset) return false;
  const settings = useSettingsStore.getState();
  settings.setSelectedPresetId(preset.id);
  settings.setSpeechRate(preset.rate);
  settings.setSpeechPitch(preset.pitch);
  if (installedVoices) settings.setSelectedVoiceId(findVoiceForPreset(preset, installedVoices));
  return true;
}

export function presetPreviewOptions(
  preset: VoicePreset,
  installedVoices: VoiceInfo[] | null,
): { voice?: string; rate: number; pitch: number } {
  const voice = installedVoices ? findVoiceForPreset(preset, installedVoices) : null;
  return { ...(voice ? { voice } : {}), rate: preset.rate, pitch: preset.pitch };
}

export function presetSpeakingStyleNote(presetId: string | null): string | null {
  const preset = VOICE_PRESETS.find((item) => item.id === presetId);
  if (!preset) return null;
  return `${preset.name} sets speed ${preset.rate.toFixed(2)}x and pitch ${preset.pitch.toFixed(2)}x. Change them in Voice settings.`;
}
