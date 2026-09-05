import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGES } from '@agiworkforce/i18n';
import { AUTO_DETECT_LANGUAGE, VOICE_LANGUAGE_CHOICES, toProviderLanguage } from '../voiceLanguage';

describe('toProviderLanguage', () => {
  it('passes a bare supported code through', () => {
    expect(toProviderLanguage('es')).toBe('es');
  });

  it('sends the primary subtag the provider accepts, not the stored locale', () => {
    expect(toProviderLanguage('pt-BR')).toBe('pt');
    expect(toProviderLanguage('EN-us')).toBe('en');
  });

  it('omits the field for auto-detect rather than forcing a default language', () => {
    expect(toProviderLanguage(AUTO_DETECT_LANGUAGE)).toBeUndefined();
    expect(toProviderLanguage('')).toBeUndefined();
    expect(toProviderLanguage(null)).toBeUndefined();
    expect(toProviderLanguage(undefined)).toBeUndefined();
  });

  it('drops a code the catalog does not carry instead of guessing', () => {
    expect(toProviderLanguage('xx-YY')).toBeUndefined();
  });
});

describe('VOICE_LANGUAGE_CHOICES', () => {
  it('offers auto-detect first and every catalog language after it', () => {
    expect(VOICE_LANGUAGE_CHOICES[0]?.value).toBe(AUTO_DETECT_LANGUAGE);
    expect(VOICE_LANGUAGE_CHOICES).toHaveLength(SUPPORTED_LANGUAGES.length + 1);
  });

  it('never offers a value the select would reject', () => {
    for (const choice of VOICE_LANGUAGE_CHOICES) {
      expect(choice.value).not.toBe('');
    }
  });

  it('offers only values the provider rule accepts or treats as auto-detect', () => {
    for (const choice of VOICE_LANGUAGE_CHOICES.slice(1)) {
      expect(toProviderLanguage(choice.value)).toBe(choice.value);
    }
  });
});
