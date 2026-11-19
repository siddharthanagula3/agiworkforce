import { OTHER_CATEGORY, type DirectoryCategory } from '@/lib/connectors/directory/categorize';
import { replaceMarkupTags } from '@/lib/markup-tags';

export const MAX_DESCRIPTION_LENGTH = 120;
export const MIN_TAGLINE_LENGTH = 20;
const MAX_DESCRIPTION_SOURCE_LENGTH = 2_000;
const MAX_MARKUP_SOURCE_LENGTH = 100_000;
const MIN_SENTENCE_LENGTH = 20;
const MIN_SENTENCE_WORDS = 4;
const MIN_CLAUSE_CUT_LENGTH = 60;
const ELLIPSIS = '…';
const SENTENCE_END = '.';
const MOJIBAKE_EM_DASHES: readonly string[] = ['ג€”', 'â€”', 'â€“'];
const EM_DASH_CODE_POINT = 0x2014;
const EN_DASH_CODE_POINT = 0x2013;
const EM_DASH = String.fromCodePoint(EM_DASH_CODE_POINT);
const DASH_LIKE_CLASS = `[${String.fromCodePoint(EN_DASH_CODE_POINT)}${EM_DASH}]`;
const DASH_LIKE = new RegExp(DASH_LIKE_CLASS, 'u');
const DESCRIPTION_DASH_REPLACEMENT = ', ';
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  'e.g',
  'i.e',
  'vs',
  'etc',
  'inc',
  'ltd',
  'co',
  'corp',
  'mr',
  'mrs',
  'ms',
  'dr',
  'st',
  'no',
  'approx',
  'ver',
  'v',
]);

const SCAFFOLD_DESCRIPTIONS: ReadonlySet<string> = new Set([
  'description of my mcp server',
  'an mcp server that provides [describe what your server does]',
]);
const STRUCTURED_PAYLOAD_START = /^\s*[{[]/u;

const CATEGORY_FALLBACK_PHRASES: Readonly<Record<DirectoryCategory, string | null>> = {
  Code: 'code and developer tools',
  Communication: 'messaging and communication',
  Data: 'data and search',
  Design: 'design and media',
  'Financial services': 'payments and finance',
  Health: 'health and care',
  Legal: 'legal and compliance work',
  'Life sciences': 'life sciences',
  Productivity: 'productivity and planning',
  'Sales and marketing': 'sales and marketing',
  Other: null,
};

const MARKDOWN_IMAGE_OPENING = '![';
const MARKDOWN_LINK_OPENING = '[';
const MARKDOWN_LABEL_CLOSE = ']';
const MARKDOWN_TARGET_OPEN = '(';
const MARKDOWN_TARGET_CLOSE = ')';
const CODE_FENCE = /```[\s\S]*?```/gu;
const INLINE_CODE = /`([^`]*)`/gu;
const MARKDOWN_AUTOLINK_OPENING = /<https?:\/\//gu;
const HTML_TAG_OPENING = /<\/?[a-zA-Z]/gu;
const MARKUP_REPLACEMENT = ' ';
const EMPHASIS_MARKERS = /(\*{1,3}|_{1,3}|~{2})(?=\S)([^*_~]+?)(?<=\S)\1/gu;
// The optional group keeps this linear: each line start consumes its whitespace run once.
const LINE_PREFIX_NOISE = /^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)?/gmu;
const URL = /\b(?:https?:\/\/|www\.)\S+/giu;
const EMOJI = /\p{Extended_Pictographic}|\uFE0F|\u200D|[\u{1F1E6}-\u{1F1FF}]/gu;
const WHITESPACE_RUN = /\s+/gu;
const NOISE_CLASS = `[\\s\\-${String.fromCodePoint(EN_DASH_CODE_POINT)}${EM_DASH}:;,|*_~"'\`([{]`;
const LEADING_NOISE = new RegExp(`^${NOISE_CLASS}+`, 'u');
const TRAILING_NOISE = new RegExp(`${NOISE_CLASS}+$`, 'u');
const MIN_ELLIPSIS_DOTS = 2;
const SENTENCE_TERMINATOR = /[.!?]/gu;
const SENTENCE_BOUNDARY_FOLLOWER = /^\s+[\p{Lu}\p{N}"'([]/u;
const CLAUSE_BOUNDARY = /[,;:]\s|\s\(/gu;
const LOWERCASE_START = /^\p{Ll}/u;
const SINGLE_LETTER = /^\p{L}$/u;
const TERMINAL_PUNCTUATION = /[.!?…]$/u;
const CLOSING_BRACKET_END = /[)\]}]$/u;
const NOISE_TOKENS = /\b(?:mcp|servers?)\b/giu;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]/gu;

function normalizeDashes(value: string): string {
  let result = value;
  for (const sequence of MOJIBAKE_EM_DASHES) result = result.split(sequence).join(EM_DASH);
  const pieces = result.split(DASH_LIKE);
  const last = pieces.length - 1;
  return pieces
    .map((piece, index) => {
      const afterDash = index > 0 ? piece.trimStart() : piece;
      return index < last ? afterDash.trimEnd() : afterDash;
    })
    .join(DESCRIPTION_DASH_REPLACEMENT);
}

function replaceMarkdownLinks(text: string, opening: string, keepLabel: boolean): string {
  let out = '';
  let cursor = 0;
  let from = 0;
  for (;;) {
    const start = text.indexOf(opening, from);
    if (start === -1) break;
    const labelStart = start + opening.length;
    const labelEnd = text.indexOf(MARKDOWN_LABEL_CLOSE, labelStart);
    if (labelEnd === -1) break;
    if (text[labelEnd + 1] !== MARKDOWN_TARGET_OPEN) {
      from = labelEnd + 1;
      continue;
    }
    const targetEnd = text.indexOf(MARKDOWN_TARGET_CLOSE, labelEnd + 2);
    if (targetEnd === -1) break;
    out += text.slice(cursor, start);
    out += keepLabel ? text.slice(labelStart, labelEnd) : MARKUP_REPLACEMENT;
    cursor = targetEnd + 1;
    from = cursor;
  }
  return out + text.slice(cursor);
}

function stripBlockMarkup(value: string): string {
  const withoutCode = value.replace(CODE_FENCE, MARKUP_REPLACEMENT);
  const withoutImages = replaceMarkdownLinks(withoutCode, MARKDOWN_IMAGE_OPENING, false);
  const withoutLinks = replaceMarkdownLinks(withoutImages, MARKDOWN_LINK_OPENING, true);
  const withoutAutolinks = replaceMarkupTags(
    withoutLinks,
    MARKDOWN_AUTOLINK_OPENING,
    MARKUP_REPLACEMENT,
  );
  return replaceMarkupTags(withoutAutolinks, HTML_TAG_OPENING, MARKUP_REPLACEMENT);
}

function dropLinePrefix(lineStart: string, prefix: string | undefined): string {
  return prefix === undefined ? lineStart : '';
}

function stripInlineMarkup(value: string): string {
  return value
    .replace(INLINE_CODE, '$1')
    .replace(EMPHASIS_MARKERS, '$2')
    .replace(LINE_PREFIX_NOISE, dropLinePrefix)
    .replace(URL, ' ')
    .replace(EMOJI, ' ')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
}

function wordBefore(text: string, index: number): string {
  const start = text.lastIndexOf(' ', index - 1) + 1;
  return text.slice(start, index).toLowerCase();
}

function firstSentence(text: string): string {
  for (const match of text.matchAll(SENTENCE_TERMINATOR)) {
    const end = match.index + 1;
    const rest = text.slice(end);
    if (rest.length > 0 && !SENTENCE_BOUNDARY_FOLLOWER.test(rest)) continue;
    const preceding = wordBefore(text, match.index);
    if (
      match[0] === SENTENCE_END &&
      (SINGLE_LETTER.test(preceding) || ABBREVIATIONS.has(preceding))
    ) {
      continue;
    }
    return text.slice(0, end);
  }
  return text;
}

function isFragment(sentence: string): boolean {
  return (
    sentence.length < MIN_SENTENCE_LENGTH ||
    sentence.split(WHITESPACE_RUN).filter(Boolean).length < MIN_SENTENCE_WORDS
  );
}

function leadingSentences(text: string): string {
  let taken = firstSentence(text);
  while (isFragment(taken) && taken.length < text.length) {
    const rest = text.slice(taken.length);
    const trimmedRest = rest.trimStart();
    const next = firstSentence(trimmedRest);
    if (!next) break;
    taken = text.slice(0, taken.length + (rest.length - trimmedRest.length) + next.length);
  }
  return taken;
}

function contentKey(value: string): string {
  return value.replace(NOISE_TOKENS, '').toLowerCase().replace(NON_ALPHANUMERIC, '');
}

export function selectDescriptionSource(
  description: string,
  name: string,
  tagline: string,
): string {
  const key = contentKey(description);
  const duplicate = key.length === 0 || key === contentKey(name);
  if (!duplicate) return description;
  return tagline.trim().length >= MIN_TAGLINE_LENGTH ? tagline : '';
}

function truncate(text: string): string {
  if (text.length <= MAX_DESCRIPTION_LENGTH) return text;
  const window = text.slice(0, MAX_DESCRIPTION_LENGTH - ELLIPSIS.length);
  let cut = -1;
  for (const match of window.matchAll(CLAUSE_BOUNDARY)) {
    if (match.index >= MIN_CLAUSE_CUT_LENGTH) cut = match.index;
  }
  if (cut === -1) cut = window.lastIndexOf(' ');
  if (cut <= 0) cut = window.length;
  return `${window.slice(0, cut).replace(TRAILING_NOISE, '')}${ELLIPSIS}`;
}

function stripTrailingEllipsis(text: string): string {
  let end = text.length;
  while (end > 0) {
    if (text[end - 1] === ELLIPSIS) {
      end -= 1;
      continue;
    }
    let dotsStart = end;
    while (dotsStart > 0 && text[dotsStart - 1] === SENTENCE_END) dotsStart -= 1;
    if (end - dotsStart < MIN_ELLIPSIS_DOTS) break;
    end = dotsStart;
  }
  return text.slice(0, end);
}

function finishSentence(text: string): string {
  const trimmed = stripTrailingEllipsis(text).replace(TRAILING_NOISE, '');
  if (!trimmed) return '';
  if (TERMINAL_PUNCTUATION.test(trimmed) || CLOSING_BRACKET_END.test(trimmed)) return trimmed;
  return `${trimmed}${SENTENCE_END}`;
}

function capitalize(text: string): string {
  return LOWERCASE_START.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function fallbackDescription(name: string, category: string): string {
  const phrase =
    CATEGORY_FALLBACK_PHRASES[category as DirectoryCategory] ??
    CATEGORY_FALLBACK_PHRASES[OTHER_CATEGORY];
  return phrase ? `${name} is a connector for ${phrase}.` : `${name} is a connector.`;
}

function isScaffold(raw: string): boolean {
  return SCAFFOLD_DESCRIPTIONS.has(raw.trim().toLowerCase()) || STRUCTURED_PAYLOAD_START.test(raw);
}

export function summarizeDescription(source: string, name: string, category: string): string {
  const capped = source.slice(0, MAX_MARKUP_SOURCE_LENGTH);
  if (isScaffold(capped)) return fallbackDescription(name, category);
  const cleaned = stripInlineMarkup(stripBlockMarkup(normalizeDashes(capped)))
    .replace(LEADING_NOISE, '')
    .slice(0, MAX_DESCRIPTION_SOURCE_LENGTH);
  const sentence = capitalize(finishSentence(leadingSentences(cleaned)));
  if (!sentence) return fallbackDescription(name, category);
  const bounded = truncate(sentence);
  return bounded.endsWith(ELLIPSIS) ? bounded : finishSentence(bounded);
}
