/**
 * Deterministic language identification for the multilingual suite.
 *
 * Non-Latin scripts are identified by the share of letters in the script's
 * Unicode block. Latin-script languages are separated by function-word
 * frequency, which is reliable on a paragraph and unreliable on a word, so the
 * multilingual corpus asks for answers of at least a sentence.
 *
 * @module evals/language
 * @packageDocumentation
 */

import type { LanguageCode } from './types';

export const LANGUAGE_CODES: readonly LanguageCode[] = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'ru',
  'ar',
  'hi',
  'ja',
  'ko',
  'zh',
  'el',
  'he',
  'th',
];

const SCRIPTS: readonly { readonly code: LanguageCode; readonly pattern: RegExp }[] = [
  { code: 'ja', pattern: /[぀-ヿ]/gu },
  { code: 'ko', pattern: /[가-힯ᄀ-ᇿ]/gu },
  { code: 'zh', pattern: /[一-鿿]/gu },
  { code: 'ru', pattern: /[Ѐ-ӿ]/gu },
  { code: 'ar', pattern: /[؀-ۿ]/gu },
  { code: 'hi', pattern: /[ऀ-ॿ]/gu },
  { code: 'el', pattern: /[Ͱ-Ͽ]/gu },
  { code: 'he', pattern: /[֐-׿]/gu },
  { code: 'th', pattern: /[฀-๿]/gu },
];

const FUNCTION_WORDS: Readonly<Record<string, readonly string[]>> = {
  en: ['the', 'and', 'is', 'of', 'to', 'in', 'that', 'it', 'with', 'for', 'are', 'this', 'you'],
  es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'es', 'por', 'una', 'para', 'con', 'se'],
  fr: ['le', 'la', 'les', 'de', 'des', 'et', 'est', 'une', 'du', 'que', 'pour', 'dans', 'vous'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'zu', 'mit', 'sie', 'den', 'ich'],
  it: ['il', 'la', 'di', 'che', 'e', 'un', 'una', 'per', 'sono', 'non', 'gli', 'della', 'con'],
  pt: ['o', 'a', 'os', 'de', 'que', 'e', 'um', 'uma', 'para', 'não', 'com', 'do', 'da', 'você'],
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'dat', 'niet', 'op', 'met', 'voor', 'zijn', 'je'],
};

const LETTER = /\p{L}/gu;

export function detectLanguage(text: string): LanguageCode | null {
  const letters = text.match(LETTER)?.length ?? 0;
  if (letters === 0) return null;

  let bestScript: { code: LanguageCode; count: number } | null = null;
  for (const { code, pattern } of SCRIPTS) {
    const count = text.match(pattern)?.length ?? 0;
    if (count > 0 && (bestScript === null || count > bestScript.count)) {
      bestScript = { code, count };
    }
  }
  const kana = text.match(SCRIPTS[0]!.pattern)?.length ?? 0;
  if (kana > 0 && bestScript !== null && (bestScript.code === 'zh' || bestScript.code === 'ja')) {
    return 'ja';
  }
  if (bestScript !== null && bestScript.count / letters >= 0.3) return bestScript.code;

  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  let best: { code: LanguageCode; score: number } | null = null;
  for (const [code, list] of Object.entries(FUNCTION_WORDS)) {
    const vocabulary = new Set(list);
    const score = words.filter((word) => vocabulary.has(word)).length;
    if (score > 0 && (best === null || score > best.score)) {
      best = { code: code as LanguageCode, score };
    }
  }
  return best?.code ?? null;
}
