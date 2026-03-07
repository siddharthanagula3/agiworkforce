import { useCallback, useRef } from 'react';
import * as Speech from 'expo-speech';

/**
 * useVoicePlayback — lightweight hook for TTS playback of assistant messages.
 *
 * Uses expo-speech (system TTS engine) which is already a project dependency.
 * For higher-quality cloud TTS (ElevenLabs, Deepgram TTS) swap `Speech.speak`
 * for the `services/tts.ts` speak() helper which supports the same interface.
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

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Stop any ongoing speech before starting a new utterance
    Speech.stop();
    isSpeaking.current = true;

    Speech.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: 1.1, // Slightly faster than default for a snappier feel
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
  }, []);

  const stop = useCallback(() => {
    Speech.stop();
    isSpeaking.current = false;
  }, []);

  return { speak, stop, isSpeaking };
}
