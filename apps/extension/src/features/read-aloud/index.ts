export const READ_ALOUD_STORAGE_KEY = 'agi_read_aloud';

export const READ_ALOUD_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

export interface ReadAloudSettings {
  voiceURI: string | null;
  rate: number;
}

export const DEFAULT_READ_ALOUD_SETTINGS: ReadAloudSettings = { voiceURI: null, rate: 1 };

export function parseReadAloudSettings(value: unknown): ReadAloudSettings {
  if (!value || typeof value !== 'object') return DEFAULT_READ_ALOUD_SETTINGS;
  const { voiceURI, rate } = value as Record<string, unknown>;
  return {
    voiceURI: typeof voiceURI === 'string' && voiceURI ? voiceURI : null,
    rate:
      typeof rate === 'number' && (READ_ALOUD_RATES as readonly number[]).includes(rate)
        ? rate
        : DEFAULT_READ_ALOUD_SETTINGS.rate,
  };
}

export function isReadAloudSupported(
  scope: Pick<typeof globalThis, 'speechSynthesis'> = globalThis,
): boolean {
  return typeof scope.speechSynthesis?.speak === 'function';
}

export async function loadReadAloudSettings(
  storage: Pick<typeof chrome.storage.local, 'get'> = chrome.storage.local,
): Promise<ReadAloudSettings> {
  try {
    const stored = await storage.get(READ_ALOUD_STORAGE_KEY);
    return parseReadAloudSettings(stored[READ_ALOUD_STORAGE_KEY]);
  } catch {
    return DEFAULT_READ_ALOUD_SETTINGS;
  }
}

export function speakAloud(
  text: string,
  settings: ReadAloudSettings,
  synth: SpeechSynthesis = globalThis.speechSynthesis,
  onEnd?: () => void,
): boolean {
  const spoken = text.trim();
  if (!spoken || typeof synth?.speak !== 'function') return false;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.rate = settings.rate;
  const voice = settings.voiceURI
    ? synth.getVoices().find((candidate) => candidate.voiceURI === settings.voiceURI)
    : undefined;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  synth.speak(utterance);
  return true;
}

export function stopSpeaking(synth: SpeechSynthesis = globalThis.speechSynthesis): void {
  if (typeof synth?.cancel === 'function') synth.cancel();
}
