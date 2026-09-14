import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  DICTATION_LANGUAGE_KEY,
  activeDictationLanguage,
  browserLanguages,
  dictationLanguageChoices,
  readDictationLanguage,
  resolveDictationLanguage,
  writeDictationLanguage,
} from '../src/features/side-panel/dictation-language';
import { micTooltip } from '../src/features/side-panel/voice';

function stubSyncStorage(initial: Record<string, unknown> = {}): Record<string, unknown> {
  const values = { ...initial };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      sync: {
        get: async (key: string) =>
          Object.prototype.hasOwnProperty.call(values, key) ? { [key]: values[key] } : {},
        set: async (items: Record<string, unknown>) => {
          Object.assign(values, items);
        },
      },
    },
  };
  return values;
}

describe('dictation language preference', () => {
  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
    vi.restoreAllMocks();
  });

  it('offers the languages this browser is configured for, newest first', () => {
    expect(browserLanguages({ languages: ['en-GB', 'fr-FR'], language: 'en-GB' })).toEqual([
      'en-GB',
      'fr-FR',
    ]);
  });

  it('drops duplicates and anything that is not a language tag', () => {
    expect(
      browserLanguages({
        languages: ['en-US', 'en-US', '', 'not a tag!!', 'de'],
        language: 'en-US',
      }),
    ).toEqual(['en-US', 'de']);
  });

  it('falls back to the browser language when nothing is stored', () => {
    expect(resolveDictationLanguage(undefined, { languages: ['pt-BR'], language: 'pt-BR' })).toBe(
      'pt-BR',
    );
  });

  it('falls back to the browser language when the stored value is not a tag', () => {
    expect(resolveDictationLanguage('  ', { languages: ['ja'], language: 'ja' })).toBe('ja');
    expect(resolveDictationLanguage(42, { languages: ['ja'], language: 'ja' })).toBe('ja');
  });

  it('leaves the language unset when the browser names none, rather than guessing one', () => {
    expect(resolveDictationLanguage(undefined, {})).toBeNull();
  });

  it('prefers the stored choice over the browser default', () => {
    expect(resolveDictationLanguage('es-MX', { languages: ['en-US'], language: 'en-US' })).toBe(
      'es-MX',
    );
  });

  it('offers a stored language the browser does not list', () => {
    const choices = dictationLanguageChoices('ko-KR', { languages: ['en-US'], language: 'en-US' });
    expect(choices.map((choice) => choice.tag)).toEqual(['ko-KR', 'en-US']);
    expect(choices[0]?.label).toContain('ko-KR');
  });

  it('reads and writes the same chrome.storage.sync key', async () => {
    const values = stubSyncStorage();
    await writeDictationLanguage('fr-CA');
    expect(values[DICTATION_LANGUAGE_KEY]).toBe('fr-CA');
    await expect(readDictationLanguage()).resolves.toBe('fr-CA');
  });

  it('refuses to store something that is not a language tag', async () => {
    const values = stubSyncStorage();
    await expect(writeDictationLanguage('not a tag!!')).rejects.toThrow(/language tag/i);
    expect(values[DICTATION_LANGUAGE_KEY]).toBeUndefined();
  });

  it('treats unreadable storage as no stored choice instead of failing dictation', async () => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        sync: {
          get: async () => {
            throw new Error('storage unavailable');
          },
        },
      },
    };
    await expect(readDictationLanguage()).resolves.toBeNull();
    await expect(activeDictationLanguage({ languages: ['it'], language: 'it' })).resolves.toBe(
      'it',
    );
  });

  it('resolves the active language from storage over the browser', async () => {
    stubSyncStorage({ [DICTATION_LANGUAGE_KEY]: 'nl-NL' });
    await expect(
      activeDictationLanguage({ languages: ['en-US'], language: 'en-US' }),
    ).resolves.toBe('nl-NL');
  });
});

describe('microphone tooltip', () => {
  beforeEach(() => {
    stubSyncStorage();
  });

  it('names the language dictation will transcribe', () => {
    expect(micTooltip('fr-FR')).toContain('fr-FR');
    expect(micTooltip('fr-FR')).toMatch(/^Voice input · /);
  });

  it('says nothing about a language when none is resolved', () => {
    expect(micTooltip(null)).toBe('Voice input');
  });
});
