
import { NativeModules, Platform } from 'react-native';
import { getDefaultModel, localGenerate } from '@agiworkforce/local-llm';

export interface TranslateResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  backend: 'apple_translate' | 'mlkit_translate' | 'local_llm';
  pairCached: boolean;
}

export interface TranslateOptions {
  onToken?: (token: string) => void;
}

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

export function isNativeTranslateAvailable(): boolean {
  return getNativeTranslate() !== null;
}

async function checkPairCached(source: string, target: string): Promise<boolean> {
  const mod = getNativeTranslate();
  if (!mod) return false;
  try {
    return await mod.isPairDownloaded(source, target);
  } catch {
    return false;
  }
}

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
      // Native translation failed — fall through to the local LLM fallback.
    }
  }

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
    backend: 'local_llm',
    pairCached: false,
  };
}

export function translateBackendLabel(backend: TranslateResult['backend']): string {
  switch (backend) {
    case 'apple_translate':
      return 'Apple Translate · on-device · instant';
    case 'mlkit_translate':
      return 'ML Kit · on-device · instant';
    case 'local_llm':
      return `${getDefaultModel().displayName} · on-device`;
  }
}
