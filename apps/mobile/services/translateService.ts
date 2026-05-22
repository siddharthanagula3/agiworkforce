/**
 * On-device translation service.
 *
 * Priority chain:
 *   iOS  : Apple Translate framework (iOS 17.4+, system, per-pair downloadable)
 *   Android: ML Kit on-device Translation (Google Play Services)
 *   Fallback: Qwen3-4B-Instruct-2507 via local LLM with a translation prompt
 *
 * All paths are 100 % on-device — no network call for translation itself.
 * Language pair download (Apple Translate / ML Kit) is handled transparently.
 */

import { NativeModules, Platform } from 'react-native';
import { getDefaultModel, localGenerate } from '@agiworkforce/local-llm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranslateResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  /** Which backend actually produced the translation. */
  backend: 'apple_translate' | 'mlkit_translate' | 'qwen3_llm';
  /** Whether the on-device language pair model is already cached. */
  pairCached: boolean;
}

export interface TranslateOptions {
  onToken?: (token: string) => void;
}

// ---------------------------------------------------------------------------
// Supported language pairs (launch: en ↔ hi; more downloadable)
// ---------------------------------------------------------------------------

export interface LanguagePair {
  code: string;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_LANGUAGES: LanguagePair[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिंदी' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
];

export const DEFAULT_SOURCE_LANG = 'en';
export const DEFAULT_TARGET_LANG = 'hi';

// ---------------------------------------------------------------------------
// Native module types
// ---------------------------------------------------------------------------

interface AGITranslateNative {
  translate: (
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ) => Promise<{ translatedText: string; backend: string }>;
  isPairDownloaded: (sourceLanguage: string, targetLanguage: string) => Promise<boolean>;
}

function getNativeTranslate(): AGITranslateNative | null {
  const mod = (NativeModules as Record<string, unknown>)['AGITranslate'] as
    | AGITranslateNative
    | undefined;
  return mod ?? null;
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export function isNativeTranslateAvailable(): boolean {
  return getNativeTranslate() !== null;
}

// ---------------------------------------------------------------------------
// Pair cache check
// ---------------------------------------------------------------------------

async function checkPairCached(source: string, target: string): Promise<boolean> {
  const mod = getNativeTranslate();
  if (!mod) return false;
  try {
    return await mod.isPairDownloaded(source, target);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main translate function
// ---------------------------------------------------------------------------

export async function translate(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  opts?: TranslateOptions,
): Promise<TranslateResult> {
  if (!text.trim()) {
    return {
      translatedText: '',
      sourceLanguage,
      targetLanguage,
      backend: Platform.OS === 'ios' ? 'apple_translate' : 'mlkit_translate',
      pairCached: false,
    };
  }

  const pairCached = await checkPairCached(sourceLanguage, targetLanguage);
  const mod = getNativeTranslate();

  // ------------------------------------------------------------------
  // iOS: Apple Translate framework (iOS 17.4+)
  // Android: ML Kit on-device Translation
  // ------------------------------------------------------------------
  if (mod) {
    try {
      const result = await mod.translate(text, sourceLanguage, targetLanguage);
      const backend =
        Platform.OS === 'ios' ? ('apple_translate' as const) : ('mlkit_translate' as const);
      return {
        translatedText: result.translatedText,
        sourceLanguage,
        targetLanguage,
        backend,
        pairCached,
      };
    } catch {
      // Native translation failed — fall through to Qwen3 LLM fallback
    }
  }

  // ------------------------------------------------------------------
  // Fallback: Qwen3-4B-Instruct-2507 on-device LLM
  // ------------------------------------------------------------------
  const sourceLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === sourceLanguage)?.label ?? sourceLanguage;
  const targetLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === targetLanguage)?.label ?? targetLanguage;

  const prompt =
    `Translate the following text from ${sourceLang} to ${targetLang}. ` +
    `Output only the translated text, nothing else.\n\n` +
    `Text: ${text}`;

  const defaultModel = getDefaultModel();
  let tokens = '';
  const result = await localGenerate(defaultModel.id, {
    modelId: defaultModel.id,
    prompt,
    onToken: (token: string) => {
      tokens += token;
      opts?.onToken?.(token);
    },
  });

  return {
    translatedText: result.text || tokens,
    sourceLanguage,
    targetLanguage,
    backend: 'qwen3_llm',
    pairCached: false,
  };
}

// ---------------------------------------------------------------------------
// Performance chip label
// ---------------------------------------------------------------------------

export function translateBackendLabel(backend: TranslateResult['backend']): string {
  switch (backend) {
    case 'apple_translate':
      return 'Apple Translate · on-device · instant';
    case 'mlkit_translate':
      return 'ML Kit · on-device · instant';
    case 'qwen3_llm':
      return 'Qwen3-4B · on-device';
  }
}
