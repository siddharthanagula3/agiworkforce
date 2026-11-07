import * as Speech from 'expo-speech';
import { speechSettings } from './speechSettings';

export interface TTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  language?: string;
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (error: Error) => void;
}

export interface VoiceInfo {
  identifier: string;
  name: string;
  quality: string;
  language: string;
}

/**
 * The Voice settings applied as TTS options. Spread this before a call site's
 * own overrides so every speaking surface honours voice, speed, pitch and
 * language.
 */
export function speechOptionsFromSettings(): Pick<
  TTSOptions,
  'voice' | 'rate' | 'pitch' | 'language'
> {
  return speechSettings();
}

export type SpeechOutcome =
  | { status: 'done' }
  | { status: 'stopped' }
  | { status: 'failed'; error: Error };

export interface SpeechHandle {
  done: Promise<SpeechOutcome>;
  stop: () => Promise<void>;
}

let activeUtterance: SpeechHandle | null = null;
let nativeControl: Promise<void> = Promise.resolve();

function queueNativeStop(): Promise<void> {
  nativeControl = nativeControl.catch(() => undefined).then(() => Speech.stop());
  return nativeControl;
}

export const preparePlayback = queueNativeStop;

export function start(text: string, options?: TTSOptions): SpeechHandle {
  void activeUtterance?.stop().catch(() => undefined);
  let settled = false;
  let stopping: Promise<void> | null = null;
  let resolveDone!: (outcome: SpeechOutcome) => void;
  const done = new Promise<SpeechOutcome>((resolve) => {
    resolveDone = resolve;
  });
  const finish = (outcome: SpeechOutcome) => {
    if (settled) return;
    settled = true;
    if (activeUtterance === handle) activeUtterance = null;
    resolveDone(outcome);
  };
  const handle: SpeechHandle = {
    done,
    stop: () => {
      if (settled) return stopping ?? Promise.resolve();
      const ownsNativeSpeech = activeUtterance === handle;
      finish({ status: 'stopped' });
      stopping = ownsNativeSpeech ? queueNativeStop() : Promise.resolve();
      void stopping.catch(() => undefined);
      return stopping;
    },
  };
  activeUtterance = handle;
  const ready = queueNativeStop();
  void ready.then(
    () => {
      if (settled || activeUtterance !== handle) return;
      try {
        Speech.speak(text, {
          voice: options?.voice,
          rate: options?.rate ?? 1.0,
          pitch: options?.pitch ?? 1.0,
          language: options?.language ?? 'en-US',
          onStart: () => {
            if (settled || activeUtterance !== handle) return;
            try {
              options?.onStart?.();
            } catch (error) {
              console.warn('[tts] speech callback failed', error);
            }
          },
          onDone: () => finish({ status: 'done' }),
          onStopped: () => finish({ status: 'stopped' }),
          onError: (error) =>
            finish({
              status: 'failed',
              error: error instanceof Error ? error : new Error(String(error)),
            }),
        });
      } catch (error) {
        finish({
          status: 'failed',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    },
    (error: unknown) =>
      finish({
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
      }),
  );
  return handle;
}

export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}

export async function getAvailableVoices(): Promise<VoiceInfo[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.map((v) => ({
      identifier: v.identifier,
      name: v.name,
      quality: v.quality,
      language: v.language,
    }));
  } catch {
    return [];
  }
}

export async function getEnglishVoices(): Promise<VoiceInfo[]> {
  return getVoicesForLanguage('en');
}

export async function getVoicesForLanguage(languagePrefix: string): Promise<VoiceInfo[]> {
  const voices = await getAvailableVoices();
  const filtered = voices.filter((v) =>
    v.language.toLowerCase().startsWith(languagePrefix.toLowerCase()),
  );
  const result = filtered.length > 0 ? filtered : voices;
  return result.sort((a, b) => {
    const qualityOrder: Record<string, number> = { Enhanced: 0, Default: 1 };
    return (qualityOrder[a.quality] ?? 2) - (qualityOrder[b.quality] ?? 2);
  });
}
