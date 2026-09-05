import { SUPPORTED_LANGUAGES, isSupportedLanguage } from '@agiworkforce/i18n';

const LOCALE_SUBTAG_SEPARATOR = '-';

/**
 * A sentinel rather than an empty string: the settings select rejects an empty
 * item value, and an unset language must still round-trip through persistence.
 */
export const AUTO_DETECT_LANGUAGE = 'auto';

export const VOICE_LANGUAGE_CHOICES: readonly { value: string; label: string }[] = [
  { value: AUTO_DETECT_LANGUAGE, label: 'Detect automatically' },
  ...SUPPORTED_LANGUAGES.map((language) => ({ value: language.code, label: language.name })),
];

/**
 * The setting holds whatever tag the picker or a restored profile supplied, but
 * the transcription slot takes a bare primary subtag and rejects a
 * region-qualified one. An unset or unrecognised value returns undefined, which
 * omits the field and leaves the provider free to detect the language itself.
 */
export function toProviderLanguage(language: string | null | undefined): string | undefined {
  const primary = (language ?? '').split(LOCALE_SUBTAG_SEPARATOR)[0]?.trim().toLowerCase() ?? '';
  return isSupportedLanguage(primary) ? primary : undefined;
}
