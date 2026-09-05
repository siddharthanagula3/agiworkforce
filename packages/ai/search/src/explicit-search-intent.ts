/**
 * Explicit web-search intent in the user's own words.
 *
 * Separate from the routing classifier on purpose: the classifier answers
 * "which task family is this turn", this answers "did the user ask for a
 * search". A turn can be `simple_chat` and still say "look this up", and a
 * `research` turn can be a request to reason over text already in context.
 * The two signals are combined by the caller, neither replaces the other.
 *
 * Every phrase lives here so a new phrasing is a one-line change with a test
 * rather than an edit inside a request pipeline.
 *
 * @module search/explicit-search-intent
 * @packageDocumentation
 */

const SEARCH_VERB_PHRASES: readonly string[] = [
  'search the web',
  'search online',
  'search for',
  'web search',
  'google it',
  'google for',
  'look it up',
  'look this up',
  'look that up',
  'look up',
  'browse the web',
  'check online',
  'check the web',
  'find online',
  'search and',
];

const RECENCY_PHRASES: readonly string[] = [
  'latest',
  'most recent',
  'up to date',
  'up-to-date',
  'today',
  "today's",
  'tonight',
  'this morning',
  'right now',
  'as of now',
  'currently',
  'current price',
  'current version',
  'breaking news',
  'in the news',
  'recent news',
  'this week',
  'this month',
];

const SOURCE_PHRASES: readonly string[] = [
  'cite a link',
  'cite links',
  'cite a source',
  'cite sources',
  'cite your sources',
  'with sources',
  'with citations',
  'link to the source',
  'link the source',
  'give me the link',
  'send me the link',
  'provide sources',
  'include sources',
  'source it',
];

function escapeForPattern(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPhrasePattern(phrases: readonly string[]): RegExp {
  const alternation = phrases
    .map(escapeForPattern)
    .sort((a, b) => b.length - a.length)
    .join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternation})(?![\\p{L}\\p{N}_])`, 'iu');
}

const SEARCH_VERB_PATTERN = buildPhrasePattern(SEARCH_VERB_PHRASES);
const RECENCY_PATTERN = buildPhrasePattern(RECENCY_PHRASES);
const SOURCE_PATTERN = buildPhrasePattern(SOURCE_PHRASES);

export type ExplicitSearchIntentSignal = 'search_verb' | 'recency' | 'sources';

export const EXPLICIT_SEARCH_INTENT_PHRASES: Readonly<
  Record<ExplicitSearchIntentSignal, readonly string[]>
> = {
  search_verb: SEARCH_VERB_PHRASES,
  recency: RECENCY_PHRASES,
  sources: SOURCE_PHRASES,
};

/**
 * The signal this text carries, or `null` when it carries none. Returning the
 * signal rather than a boolean keeps the reason auditable in telemetry.
 */
export function detectExplicitWebSearchIntent(text: string): ExplicitSearchIntentSignal | null {
  if (!text) return null;
  if (SEARCH_VERB_PATTERN.test(text)) return 'search_verb';
  if (RECENCY_PATTERN.test(text)) return 'recency';
  if (SOURCE_PATTERN.test(text)) return 'sources';
  return null;
}

export function hasExplicitWebSearchIntent(text: string): boolean {
  return detectExplicitWebSearchIntent(text) !== null;
}
