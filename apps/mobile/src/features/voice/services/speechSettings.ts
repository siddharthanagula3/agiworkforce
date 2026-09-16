import { useSettingsStore } from '@/stores/settingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';

export interface SpeechSettings {
  voice: string | undefined;
  rate: number;
  pitch: number;
  language: string;
}

/** The speech language is per trust domain, like the rest of the voice settings. */
export function activeSpeechLanguage(): string {
  return useChatAppModeStore.getState().appMode === 'cloud'
    ? useCloudSettingsStore.getState().speechLanguage
    : useLocalSettingsStore.getState().speechLanguage;
}

export function autoListenEnabled(): boolean {
  return useChatAppModeStore.getState().appMode === 'cloud'
    ? useCloudSettingsStore.getState().autoListenEnabled
    : useLocalSettingsStore.getState().autoListenEnabled;
}

/**
 * Every place the app speaks reads the same four settings, so a change in the
 * Voice screen reaches the companion and both inline chat bars alike.
 */
export function speechSettings(): SpeechSettings {
  const { selectedVoiceId, speechRate, speechPitch } = useSettingsStore.getState();
  return {
    voice: selectedVoiceId ?? undefined,
    rate: speechRate,
    pitch: speechPitch,
    language: activeSpeechLanguage(),
  };
}
