import type { PlacePriceLevel, PlacesCardPlace } from '@agiworkforce/types';

const PRICE_LEVEL_LABELS: Record<PlacePriceLevel, string> = {
  free: 'Free',
  inexpensive: '$',
  moderate: '$$',
  expensive: '$$$',
  very_expensive: '$$$$',
};

export const OPEN_NOW_LABEL = 'Open';
export const CLOSED_NOW_LABEL = 'Closed';

const RATING_FRACTION_DIGITS = 1;

export function priceLevelLabel(level: PlacePriceLevel | undefined): string | null {
  return level ? PRICE_LEVEL_LABELS[level] : null;
}

export function ratingLabel(rating: number | undefined): string | null {
  return rating === undefined ? null : rating.toFixed(RATING_FRACTION_DIGITS);
}

export function reviewCountLabel(reviewCount: number | undefined): string | null {
  if (reviewCount === undefined) return null;
  return `(${reviewCount.toLocaleString()})`;
}

export function openNowLabel(openNow: boolean | undefined): string | null {
  if (openNow === undefined) return null;
  return openNow ? OPEN_NOW_LABEL : CLOSED_NOW_LABEL;
}

export function placeMarkerName(place: PlacesCardPlace): string {
  const rating = ratingLabel(place.rating);
  return rating === null ? place.name : `${place.name}, rated ${rating} out of 5`;
}

export function placeSummaryLine(place: PlacesCardPlace): string {
  return [priceLevelLabel(place.priceLevel), place.category]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

export const ASSISTANT_NOTE_HEADING = 'About, from this answer';
export const ASSISTANT_NOTE_MAX_LENGTH = 320;
export const ASSISTANT_NOTE_MIN_NAME_LENGTH = 3;

const MARKDOWN_MARKS_RE = /[*_`~]|\[|\]\([^)]*\)/gu;
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+(?=[A-Z0-9"'(])/u;
const LIST_MARKER_RE = /^\s*(?:[-*+]|\d+[.)])\s+/u;
const WHITESPACE_RE = /\s+/gu;
const NAME_HEAD_RE = /^[^,\-\u{2013}\u{2014}(]+/u;

function plainText(markdown: string): string {
  return markdown.replace(MARKDOWN_MARKS_RE, '').replace(WHITESPACE_RE, ' ').trim();
}

function candidateNames(placeName: string): string[] {
  const head = NAME_HEAD_RE.exec(placeName)?.[0]?.trim();
  const names = [placeName.trim(), head ?? ''].filter(
    (name) => name.length >= ASSISTANT_NOTE_MIN_NAME_LENGTH,
  );
  return Array.from(new Set(names));
}

export function assistantNoteForPlace(
  assistantText: string | undefined,
  placeName: string,
): string | null {
  if (!assistantText) return null;
  const names = candidateNames(placeName);
  if (names.length === 0) return null;

  const lines = assistantText.split('\n');
  for (const line of lines) {
    const cleaned = plainText(line.replace(LIST_MARKER_RE, ''));
    if (cleaned.length === 0) continue;
    for (const sentence of cleaned.split(SENTENCE_SPLIT_RE)) {
      const trimmed = sentence.trim();
      if (trimmed.length === 0) continue;
      const haystack = trimmed.toLowerCase();
      if (!names.some((name) => haystack.includes(name.toLowerCase()))) continue;
      return trimmed.length > ASSISTANT_NOTE_MAX_LENGTH
        ? `${trimmed.slice(0, ASSISTANT_NOTE_MAX_LENGTH).trimEnd()}…`
        : trimmed;
    }
  }

  return null;
}
