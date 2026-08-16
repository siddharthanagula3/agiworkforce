import * as Speech from 'expo-speech';

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

export async function speak(text: string, options?: TTSOptions): Promise<void> {
  await Speech.stop();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    Speech.speak(text, {
      voice: options?.voice,
      rate: options?.rate ?? 1.0,
      pitch: options?.pitch ?? 1.0,
      language: options?.language ?? 'en-US',
      onStart: () => {
        options?.onStart?.();
      },
      onDone: () => {
        if (settled) return;
        settled = true;
        options?.onDone?.();
        resolve();
      },
      onStopped: () => {
        if (settled) return;
        settled = true;
        options?.onStopped?.();
        resolve();
      },
      onError: (error) => {
        if (settled) return;
        settled = true;
        const err = error instanceof Error ? error : new Error(String(error));
        options?.onError?.(err);
        reject(err);
      },
    });
  });
}

export async function stop(): Promise<void> {
  await Speech.stop();
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

export async function getAvailableLanguages(): Promise<
  { code: string; label: string; locale: string }[]
> {
  const voices = await getAvailableVoices();
  const seen = new Map<string, string>();
  for (const v of voices) {
    const code = v.language.split('-')[0].toLowerCase();
    if (!seen.has(code)) seen.set(code, v.language);
  }
  const DisplayNamesConstructor = Intl.DisplayNames;
  const displayNames =
    typeof DisplayNamesConstructor === 'function'
      ? new DisplayNamesConstructor(['en'], { type: 'language' })
      : null;
  return Array.from(seen.entries())
    .map(([code, locale]) => ({
      code,
      locale,
      label: displayNames?.of(code) ?? code.toUpperCase(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
