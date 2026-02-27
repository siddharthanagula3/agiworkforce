import * as Speech from 'expo-speech';

/**
 * Text-to-speech service.
 * Uses expo-speech (system TTS) for v1.
 * Cloud TTS (ElevenLabs, OpenAI) can be added as a provider later.
 */

export interface TTSOptions {
  /** Voice identifier (platform-specific). Pass undefined for system default. */
  voice?: string;
  /** Speech rate: 0.5 = half speed, 1.0 = normal, 2.0 = double. Default 1.0 */
  rate?: number;
  /** Pitch multiplier: 0.5 = low, 1.0 = normal, 2.0 = high. Default 1.0 */
  pitch?: number;
  /** Language/locale code (e.g., 'en-US'). Default: system locale */
  language?: string;
  /** Callback when speech starts */
  onStart?: () => void;
  /** Callback when speech finishes */
  onDone?: () => void;
  /** Callback when speech is stopped early */
  onStopped?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface VoiceInfo {
  identifier: string;
  name: string;
  quality: string;
  language: string;
}

/**
 * Speak the given text using the system TTS engine.
 * Stops any currently playing speech first.
 */
export async function speak(text: string, options?: TTSOptions): Promise<void> {
  // Always stop before speak to prevent race condition where two concurrent
  // calls both pass isSpeakingAsync check
  await Speech.stop();

  return new Promise<void>((resolve, reject) => {
    Speech.speak(text, {
      voice: options?.voice,
      rate: options?.rate ?? 1.0,
      pitch: options?.pitch ?? 1.0,
      language: options?.language ?? 'en-US',
      onStart: () => {
        options?.onStart?.();
      },
      onDone: () => {
        options?.onDone?.();
        resolve();
      },
      onStopped: () => {
        options?.onStopped?.();
        resolve();
      },
      onError: (error) => {
        const err = error instanceof Error ? error : new Error(String(error));
        options?.onError?.(err);
        reject(err);
      },
    });
  });
}

/**
 * Stop any currently playing speech.
 */
export async function stop(): Promise<void> {
  await Speech.stop();
}

/**
 * Check if the TTS engine is currently speaking.
 */
export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}

/**
 * Get available TTS voices on this device.
 * Results vary by platform and installed voice packs.
 */
export async function getAvailableVoices(): Promise<VoiceInfo[]> {
  const voices = await Speech.getAvailableVoicesAsync();
  return voices.map((v) => ({
    identifier: v.identifier,
    name: v.name,
    quality: v.quality,
    language: v.language,
  }));
}

/**
 * Get available English voices, sorted by quality.
 */
export async function getEnglishVoices(): Promise<VoiceInfo[]> {
  const voices = await getAvailableVoices();
  return voices
    .filter((v) => v.language.startsWith('en'))
    .sort((a, b) => {
      // Prefer 'Enhanced' / 'Premium' quality
      const qualityOrder: Record<string, number> = { Enhanced: 0, Default: 1 };
      return (qualityOrder[a.quality] ?? 2) - (qualityOrder[b.quality] ?? 2);
    });
}
