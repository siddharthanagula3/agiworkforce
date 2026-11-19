import { useSettingsStore } from '@/stores/settingsStore';
import { VOICE_PRESETS, findVoiceForPreset } from '@/src/features/voice/voicePresets';
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
