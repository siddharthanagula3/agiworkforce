import { useCallback, useRef } from 'react';
import * as Speech from 'expo-speech';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * useVoicePlayback — lightweight hook for TTS playback of assistant messages.
 *
 * Uses expo-speech (system TTS engine) which is already a project dependency.
 * Voice identity and speech rate are read from the settings store so the user
 * can configure them in the Voice selector without restarting the app.
 *
 * @example
 *   const { speak, stop } = useVoicePlayback();
 *
 *   // Speak a completed assistant message
 *   useEffect(() => {
 *     if (lastMessage?.role === 'assistant' && !lastMessage.isStreaming) {
 *       speak(lastMessage.content);
 *     }
 *   }, [lastMessage?.id]);
 */
export function useVoicePlayback() {
  const isSpeaking = useRef(false);
  const selectedVoiceId = useSettingsStore((s) => s.selectedVoiceId);
  const speechRate = useSettingsStore((s) => s.speechRate);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Stop any ongoing speech before starting a new utterance
      Speech.stop();
      isSpeaking.current = true;

      Speech.speak(text, {
        voice: selectedVoiceId ?? undefined,
        language: 'en-US',
        pitch: 1.0,
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
    [selectedVoiceId, speechRate],
  );

  const stop = useCallback(() => {
    Speech.stop();
    isSpeaking.current = false;
  }, []);

  return { speak, stop, isSpeaking };
}
