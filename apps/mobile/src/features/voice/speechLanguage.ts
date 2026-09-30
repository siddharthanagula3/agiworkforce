export const SPEECH_LANGUAGE_AUTO = 'auto';

const LEGACY_DEFAULT_SPEECH_LANGUAGE = 'en';

export function chosenSpeechLanguage(value: string): string | undefined {
  return value === SPEECH_LANGUAGE_AUTO ? undefined : value;
}

export function speechLanguageFromLegacy(value: unknown): string {
  return typeof value === 'string' && value && value !== LEGACY_DEFAULT_SPEECH_LANGUAGE
    ? value
    : SPEECH_LANGUAGE_AUTO;
}
