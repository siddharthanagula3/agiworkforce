import { useCallback, useRef } from 'react';
import * as Speech from 'expo-speech';
import { useSettingsStore } from '@/stores/settingsStore';

export function useVoicePlayback() {
  const isSpeaking = useRef(false);
  const selectedVoiceId = useSettingsStore((s) => s.selectedVoiceId);
  const speechRate = useSettingsStore((s) => s.speechRate);
  const speechPitch = useSettingsStore((s) => s.speechPitch);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      Speech.stop();
      isSpeaking.current = true;

      Speech.speak(text, {
        voice: selectedVoiceId ?? undefined,
        language: 'en-US',
        pitch: speechPitch,
        rate: speechRate,
        onDone: () => {
          isSpeaking.current = false;
        },
        onStopped: () => {
          isSpeaking.current = false;
        },
        onError: () => {
          isSpeaking.current = false;
        },
      });
    },
    [selectedVoiceId, speechRate, speechPitch],
  );

  const stop = useCallback(() => {
    Speech.stop();
    isSpeaking.current = false;
  }, []);

  return { speak, stop, isSpeaking };
}
