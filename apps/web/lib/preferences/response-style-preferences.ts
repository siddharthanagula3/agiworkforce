export const RESPONSE_STYLES = ['default', 'concise', 'explanatory', 'formal'] as const;
export type ResponseStyle = (typeof RESPONSE_STYLES)[number];

export const TECHNICAL_LEVELS = ['unspecified', 'beginner', 'intermediate', 'expert'] as const;
export type TechnicalLevel = (typeof TECHNICAL_LEVELS)[number];

export const PREFERRED_FORMATTINGS = [
  'unspecified',
  'prose',
  'bullets',
  'headings_and_bullets',
  'tables_and_code',
] as const;
export type PreferredFormatting = (typeof PREFERRED_FORMATTINGS)[number];

/**
 * 'auto' means answer in the language the user wrote in. It is the default
 * because the display language is a different preference: someone reading the
 * interface in German may well be writing to the model in English, and the
 * language picker in settings says so outright.
 */
export const RESPONSE_LANGUAGE_AUTO = 'auto';

export interface ResponseStylePreference {
  style: ResponseStyle;
  technicalLevel: TechnicalLevel;
  preferredFormatting: PreferredFormatting;
  responseLanguage: string;
  traits: Readonly<Record<string, number>>;
}

export const RESPONSE_STYLE_PREFERENCE_DEFAULTS: ResponseStylePreference = Object.freeze({
  style: 'default',
  technicalLevel: 'unspecified',
  preferredFormatting: 'unspecified',
  responseLanguage: RESPONSE_LANGUAGE_AUTO,
  traits: Object.freeze({}),
});

const STYLE_GUIDANCE: Readonly<Record<Exclude<ResponseStyle, 'default'>, string>> = {
  concise: 'Keep responses short and direct. Lead with the answer.',
  explanatory: 'Explain your reasoning and give context, as if teaching.',
  formal: 'Use a formal register. Avoid contractions and casual phrasing.',
};

const TECHNICAL_LEVEL_GUIDANCE: Readonly<Record<Exclude<TechnicalLevel, 'unspecified'>, string>> = {
  beginner:
    'The user is new to this subject. Define terms before using them and prefer plain language over jargon.',
  intermediate:
    'The user is comfortable with the basics. Skip introductory explanation and name things precisely.',
  expert:
    'The user is an expert. Be technically precise, assume domain vocabulary and do not restate fundamentals.',
};

const FORMATTING_GUIDANCE: Readonly<Record<Exclude<PreferredFormatting, 'unspecified'>, string>> = {
  prose: 'Answer in flowing prose. Avoid headers and bullet lists.',
  bullets: 'Prefer short bullet lists over paragraphs.',
  headings_and_bullets: 'Structure answers with headings and bullet lists.',
  tables_and_code: 'Prefer tables for comparisons and fenced code blocks for anything executable.',
};

const TRAIT_BAND = 20;

interface TraitCopy {
  low: string;
  high: string;
}

const TRAIT_GUIDANCE: Readonly<Record<string, TraitCopy>> = {
  warmth: { low: 'Keep a neutral, businesslike tone.', high: 'Be warm and personable.' },
  enthusiasm: {
    low: 'Stay measured; skip exclamations and hype.',
    high: 'Be energetic and encouraging.',
  },
  headersLists: {
    low: 'Prefer flowing prose over headers and bullet lists.',
    high: 'Use headers and bullet lists to structure answers.',
  },
  emoji: { low: 'Do not use emoji.', high: 'Emoji are welcome where they help.' },
};

export const RESPONSE_STYLE_TRAIT_KEYS = Object.keys(TRAIT_GUIDANCE);

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function readTraits(namespace: Record<string, unknown>): Record<string, number> {
  const traits: Record<string, number> = {};
  for (const key of RESPONSE_STYLE_TRAIT_KEYS) {
    const raw = namespace[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    traits[key] = Math.max(0, Math.min(100, raw));
  }
  return traits;
}

const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;

function readResponseLanguage(value: unknown): string {
  if (typeof value !== 'string') return RESPONSE_LANGUAGE_AUTO;
  const trimmed = value.trim();
  if (!trimmed || trimmed === RESPONSE_LANGUAGE_AUTO) return RESPONSE_LANGUAGE_AUTO;
  return LANGUAGE_TAG.test(trimmed) ? trimmed : RESPONSE_LANGUAGE_AUTO;
}

export function normalizeResponseStylePreference(
  namespace: Record<string, unknown>,
): ResponseStylePreference {
  return {
    style: pick(namespace['style'], RESPONSE_STYLES, 'default'),
    technicalLevel: pick(namespace['technicalLevel'], TECHNICAL_LEVELS, 'unspecified'),
    preferredFormatting: pick(
      namespace['preferredFormatting'],
      PREFERRED_FORMATTINGS,
      'unspecified',
    ),
    responseLanguage: readResponseLanguage(namespace['responseLanguage']),
    traits: readTraits(namespace),
  };
}

function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * The prompt lines one preference set produces, in the order they are read:
 * language first, because answering in the wrong language makes everything
 * after it irrelevant, then level, then formatting, then tone.
 */
export function responseStyleLines(preference: ResponseStylePreference): string[] {
  const lines: string[] = [];

  if (preference.responseLanguage !== RESPONSE_LANGUAGE_AUTO) {
    lines.push(
      `Respond in ${languageName(preference.responseLanguage)} unless the user asks for another language.`,
    );
  }
  if (preference.technicalLevel !== 'unspecified') {
    lines.push(TECHNICAL_LEVEL_GUIDANCE[preference.technicalLevel]);
  }
  if (preference.preferredFormatting !== 'unspecified') {
    lines.push(FORMATTING_GUIDANCE[preference.preferredFormatting]);
  }
  if (preference.style !== 'default') {
    lines.push(STYLE_GUIDANCE[preference.style]);
  }
  for (const [key, copy] of Object.entries(TRAIT_GUIDANCE)) {
    const value = preference.traits[key];
    if (value === undefined) continue;
    if (value <= 50 - TRAIT_BAND) lines.push(copy.low);
    else if (value >= 50 + TRAIT_BAND) lines.push(copy.high);
  }

  return lines;
}
