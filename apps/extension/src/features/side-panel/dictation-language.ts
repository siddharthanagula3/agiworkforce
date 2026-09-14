/**
 * Which language the side panel's microphone transcribes.
 *
 * Web keeps a dictation language beside its composer; the extension has no
 * hosted settings client to share that store, so the choice lives in
 * `chrome.storage.sync` and follows the user's Chrome profile the same way the
 * other side-panel preferences do.
 *
 * The offered languages come from the browser rather than from a list written
 * down here: `SpeechRecognition` is the browser's own engine, and
 * `navigator.languages` is what this profile is configured for.
 */

export const DICTATION_LANGUAGE_KEY = 'agi_dictation_language';

export interface DictationLanguageChoice {
  tag: string;
  label: string;
}

export interface DictationLanguageEnvironment {
  languages?: readonly string[];
  language?: string;
}

function canonical(tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  const trimmed = tag.trim();
  if (!trimmed) return null;
  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? null;
  } catch {
    return null;
  }
}

/** The profile's languages, newest preference first, with duplicates dropped. */
export function browserLanguages(environment: DictationLanguageEnvironment): string[] {
  const candidates = [...(environment.languages ?? []), environment.language];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const tag = canonical(candidate);
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/**
 * The language dictation runs in. `null` means leave `SpeechRecognition.lang`
 * alone, so the browser's own default applies rather than a guess made here.
 */
export function resolveDictationLanguage(
  stored: unknown,
  environment: DictationLanguageEnvironment,
): string | null {
  return canonical(stored) ?? browserLanguages(environment)[0] ?? null;
}

/** Every language the drawer offers: the browser's, plus whatever is stored. */
export function dictationLanguageChoices(
  stored: unknown,
  environment: DictationLanguageEnvironment,
): DictationLanguageChoice[] {
  const tags = browserLanguages(environment);
  const storedTag = canonical(stored);
  if (storedTag && !tags.includes(storedTag)) tags.unshift(storedTag);
  return tags.map((tag) => ({ tag, label: languageLabel(tag) }));
}

/** The language's own name for it, falling back to the tag itself. */
export function languageLabel(tag: string): string {
  try {
    const display = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
    return display && display !== tag ? `${display} (${tag})` : tag;
  } catch {
    return tag;
  }
}

export async function readDictationLanguage(): Promise<string | null> {
  try {
    const stored = await chrome.storage.sync.get(DICTATION_LANGUAGE_KEY);
    return canonical(stored[DICTATION_LANGUAGE_KEY]);
  } catch {
    return null;
  }
}

export async function writeDictationLanguage(tag: string): Promise<void> {
  const value = canonical(tag);
  if (!value) throw new Error('Not a language tag this browser recognises');
  await chrome.storage.sync.set({ [DICTATION_LANGUAGE_KEY]: value });
}

/**
 * The language dictation will actually use right now, resolved against the
 * stored choice and this profile's languages.
 */
export async function activeDictationLanguage(
  environment: DictationLanguageEnvironment = navigator,
): Promise<string | null> {
  return resolveDictationLanguage(await readDictationLanguage(), environment);
}
