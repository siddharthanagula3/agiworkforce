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
  'search on the web',
  'search in the web',
  'search the internet',
  'search on the internet',
  'search in the internet',
  'search online',
  'search for',
  'web search',
  'web searches',
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
const SEARCH_OPT_OUT_PATTERN =
  /\b(?:do\s+not|don't|dont|never|avoid|without|no)\s+(?:(?:use|perform|performing)\s+)?(?:(?:a|the)\s+)?(?:web\s+search(?:es)?|search(?:ing)?\s+(?:(?:the|on)\s+)?(?:web|internet|online)|browse(?:ing)?\s+(?:the\s+)?web|look(?:ing)?\s+(?:it|this|that)\s+up)\b/iu;
const LONG_DASHES = String.fromCharCode(0x2013, 0x2014);
const REFUSAL_CLAUSE_START = String.raw`(?:^|[.;:!?,()\n*>\u2022${LONG_DASHES}]|(?<![\p{L}\p{N}])-)[^\S\n]*(?:(?:and|but|so|also|please|again)\s+)?`;
const REFUSAL_CLAUSE_END = String.raw`(?=\s*(?:$|[.,;:!?()\n*\u2026${LONG_DASHES}])|\s+-\s|\s+(?:or|nor|and(?!\s+replace\b)|but|just|please|yet|(?:is\s+)?(?:needed|required|necessary|allowed)|at\s+all|this\s+time)\b)`;
const REFUSING_AUXILIARY = String.raw`(?:do\s+not|don['\u2019]?t|never)`;
const REFUSING_MODAL = String.raw`(?:${REFUSING_AUXILIARY}\s+(?:(?:need|have)\s+to|want\s+you\s+to)|no\s+need\s+to)`;
const REFUSING_IMPERATIVE = String.raw`(?:${REFUSAL_CLAUSE_START}|\b(?:and|but|so|then|just|please)\s+)${REFUSING_AUXILIARY}`;
const REFUSING_COMMAND = String.raw`(?:${REFUSING_IMPERATIVE}|\b${REFUSING_MODAL})`;
const REFUSED_LIST_ITEM = String.raw`(?:[\p{L}\p{N}'\u2019/-]+\s+)?[\p{L}\p{N}'\u2019/-]+`;
const REFUSED_SEARCH_NOUN = String.raw`(?:(?:web|internet|online|external|live)\s+)?(?:search(?:es|ing)?|browsing|googling)`;
const REFUSED_OTHER_ACTIONS = String.raw`(?!\s+(?:just|only|simply|hesitate|forget|fail|worry|be\s+afraid)\b)\s(?:[^.;:!?,\n${LONG_DASHES}]{1,80}?|[^.;:!?\n${LONG_DASHES}]{1,80}?,)\s(?:or|nor)\s+`;

const SEARCH_REFUSAL_FORMS: Readonly<Record<string, string>> = {
  namedTarget: String.raw`\b(?:${REFUSING_MODAL}|${REFUSING_AUXILIARY}|avoid|without|no)\s+(?:(?:use|perform|performing)\s+)?(?:(?:a|the)\s+)?(?:web\s+search(?:es)?|search(?:ing)?\s+(?:(?:on|in)\s+)?(?:the\s+)?(?:web|internet|online)|brows(?:e|ing)\s+(?:the\s+)?web|look(?:ing)?\s+(?:(?:it|this|that|anything)\s+up|up\s+anything)|googl(?:e|ing)\s+(?:it|this|that)|check(?:ing)?\s+(?:online|the\s+web))\b`,
  bareAction: String.raw`(?:${REFUSING_COMMAND}\s+(?:search|browse|google)|\b(?:without|avoid)\s+(?:searching|browsing|googling))(?:\s+(?:for\s+)?anything)?${REFUSAL_CLAUSE_END}`,
  toolUse: String.raw`(?:${REFUSING_COMMAND}\s+(?:use|run|do|perform)|\b(?:without|no|avoid)\s+(?:using|running|doing|performing))\s+(?:(?:a|an|any|the|your)\s+)?(?:(?:web|internet|online)\s+)?search(?:es)?(?:\s+tools?)?${REFUSAL_CLAUSE_END}`,
  listedAction: String.raw`\s(?:or|nor)\s+(?<=${REFUSING_IMPERATIVE}${REFUSED_OTHER_ACTIONS})(?:search(?:\s+(?:(?:on|in)\s+)?(?:the\s+)?(?:web|internet|online))?|browse(?:\s+the\s+web)?|google|look\s+(?:it|this|that|anything)\s+up)(?:\s+(?:for\s+)?anything)?${REFUSAL_CLAUSE_END}`,
  bareNoun: String.raw`${REFUSAL_CLAUSE_START}no\s+${REFUSED_SEARCH_NOUN}(?:\s+(?:for|on)\s+(?:this|that)(?:\s+one)?|\s+for\s+now|\s+today|\s+here)?${REFUSAL_CLAUSE_END}`,
  listedBeforeLastItem: String.raw`${REFUSAL_CLAUSE_START}no\s+(?:${REFUSED_LIST_ITEM}\s*,\s*){1,6}${REFUSED_SEARCH_NOUN}(?:\s*,\s*${REFUSED_LIST_ITEM}){0,6}(?:\s*,)?\s+(?:or|nor)\s+(?=[\p{L}\p{N}])`,
  listedLast: String.raw`${REFUSAL_CLAUSE_START}no\s+(?:${REFUSED_LIST_ITEM}\s*,\s*){0,6}${REFUSED_LIST_ITEM}(?:\s*,)?\s+(?:or|nor|and\s+no)\s+${REFUSED_SEARCH_NOUN}${REFUSAL_CLAUSE_END}`,
};

const SEARCH_REFUSAL_PATTERN = new RegExp(Object.values(SEARCH_REFUSAL_FORMS).join('|'), 'giu');

const REFUSED_LIST_PATTERN = new RegExp(
  String.raw`(?:${REFUSING_IMPERATIVE}|\b(?:without|avoid)|${REFUSAL_CLAUSE_START}(?:no|not))(?!\s+(?:just|only|simply|hesitate|forget|fail|worry|worries|mind|stop|be\s+afraid|problem|problems|thanks|idea|doubt|matter|way|sure|need\s+to\s+ask)\b)[^\S\n]+([^.;:!?\n${LONG_DASHES}]{1,400})(?=[.;:!?\n${LONG_DASHES}]|$)`,
  'giu',
);
const REFUSED_LIST_SEPARATOR = /,\s*(?:(?:or|nor)\s+)?|\s(?:or|nor)\s+/giu;
const WHITESPACE_CHARACTER = /\s/u;
const LIST_CLOSING_CONJUNCTION = /\b(?:or|nor)\b/iu;
const REFUSED_ITEM_TRAILING_QUALIFIER =
  /(?:\s+(?:at\s+all|this\s+time|for\s+(?:this(?:\s+one)?|now)|here|today|now|please|either|again))+$/u;
const REFUSED_ITEM_LEADING_FILLER =
  /^(?:(?:use|using|run|running|call|calling|do|doing|perform|performing|make|making|execute|executing|access|accessing|invoke|invoking|any|a|an|the|your|some|external|outside|other|extra|additional)\s+)+/u;
const REFUSED_WEB_SEARCH_ITEM =
  /^(?:(?:(?:web|internet|online|live|public)\s+)?(?:search(?:es|ing)?|brows(?:e|ing)|googl(?:e|ing))(?:\s+(?:(?:on|in)\s+)?(?:the\s+)?(?:web|internet|online))?(?:\s+tools?)?|(?:the\s+)?(?:web|internet)|look(?:ing)?\s+(?:(?:it|this|that|anything)\s+up|up\s+anything)|check(?:ing)?\s+(?:online|the\s+web))$/u;
const PRIVATE_SCOPE_ONLY_PATTERN =
  /\b(?:(?:only|just)\s+(?:search|use|check|look\s+(?:in|at|through)|draw\s+on)|(?:search|use|check)\s+only(?:\s+(?:in|through))?)\s+(?:my|our)\s+(?:own\s+)?(?:private\s+)?(?:(?:past|earlier|previous|prior|old|saved|other)\s+)?(?:chats?|conversations?|(?:chat\s+)?history|memor(?:y|ies)|files?|documents?|notes?)\b/iu;

type RefusedItem = { text: string; start: number; end: number };

function normalizeRefusedItem(item: string): string {
  return item
    .toLowerCase()
    .trim()
    .replace(REFUSED_ITEM_TRAILING_QUALIFIER, '')
    .replace(REFUSED_ITEM_LEADING_FILLER, '');
}

/**
 * A refusal governs a list only when the list is unambiguous: "a or b", or a
 * comma list closed by ", or". "Don't guess, check the docs or search the web"
 * refuses the guess and asks for the rest, so a comma list without that closing
 * comma refuses its first item alone.
 */
function refusedItemsOfClause(clause: string, offset: number): RefusedItem[] {
  const segments: RefusedItem[] = [];
  const separators: string[] = [];
  let cursor = 0;
  for (const separator of clause.matchAll(REFUSED_LIST_SEPARATOR)) {
    let separatorStart = separator.index;
    while (
      separatorStart > cursor &&
      WHITESPACE_CHARACTER.test(clause.charAt(separatorStart - 1))
    ) {
      separatorStart -= 1;
    }
    const separatorEnd = separator.index + separator[0].length;
    segments.push({
      text: clause.slice(cursor, separatorStart),
      start: cursor,
      end: separatorStart,
    });
    separators.push(clause.slice(separatorStart, separatorEnd));
    cursor = separatorEnd;
  }
  segments.push({ text: clause.slice(cursor), start: cursor, end: clause.length });

  let lastOr = -1;
  separators.forEach((separator, index) => {
    if (LIST_CLOSING_CONJUNCTION.test(separator)) lastOr = index;
  });
  const closedList =
    lastOr === 0 || (lastOr > 0 && separators[lastOr]!.trimStart().startsWith(','));
  const refused = closedList ? segments.slice(0, lastOr + 2) : segments.slice(0, 1);
  return refused
    .map((segment) => ({
      text: normalizeRefusedItem(segment.text),
      start: offset + segment.start,
      end: offset + segment.end,
    }))
    .filter((segment) => segment.text.length > 0);
}

function refusedItemsOf(text: string): RefusedItem[] {
  const items: RefusedItem[] = [];
  for (const match of text.matchAll(REFUSED_LIST_PATTERN)) {
    const clause = match[1] ?? '';
    const clauseStart = match.index + match[0].length - clause.length;
    items.push(...refusedItemsOfClause(clause, clauseStart));
  }
  return items;
}

/**
 * The things one refusal in this text rules out, normalised to their bare noun
 * or action: "Do not browse, run code, or use external tools" gives `browse`,
 * `code` and `tools`. Callers classify the items; this only reads the list.
 */
export function explicitlyRefusedItems(text: string): string[] {
  return refusedItemsOf(text).map((item) => item.text);
}

function hasListedWebSearchRefusal(text: string): boolean {
  const refusedSearches = refusedItemsOf(text).filter((item) =>
    REFUSED_WEB_SEARCH_ITEM.test(item.text),
  );
  if (refusedSearches.length === 0) return false;
  let outsideRefusals = text;
  for (const item of [...refusedSearches].reverse()) {
    outsideRefusals = `${outsideRefusals.slice(0, item.start)}\n${outsideRefusals.slice(item.end)}`;
  }
  outsideRefusals = outsideRefusals.replace(SEARCH_REFUSAL_PATTERN, '\n');
  return !SEARCH_VERB_PATTERN.test(outsideRefusals);
}
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"']+/i;
const URL_FETCH_ACTION_PATTERN =
  /\b(read|summarize|analyse|analyze|review|check|inspect|open|fetch)\b/i;
const URL_FETCH_OPT_OUT_PATTERN =
  /\b(?:do\s+not|don't|dont|never|avoid)\s+(?:fetch|open|read)\s+(?:(?:this|that|the|these|those|any)\s+)?(?:url|link|page|https?:\/\/)/iu;

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
  if (hasExplicitWebSearchOptOut(text)) return null;
  if (SEARCH_VERB_PATTERN.test(text)) return 'search_verb';
  if (RECENCY_PATTERN.test(text)) return 'recency';
  if (SOURCE_PATTERN.test(text)) return 'sources';
  return null;
}

export function hasExplicitWebSearchOptOut(text: string): boolean {
  if (SEARCH_OPT_OUT_PATTERN.test(text) || PRIVATE_SCOPE_ONLY_PATTERN.test(text)) return true;
  const outsideRefusals = text.replace(SEARCH_REFUSAL_PATTERN, '\n');
  if (outsideRefusals !== text && !SEARCH_VERB_PATTERN.test(outsideRefusals)) return true;
  return hasListedWebSearchRefusal(text);
}

export function hasExplicitWebSearchIntent(text: string): boolean {
  return detectExplicitWebSearchIntent(text) !== null;
}

export function hasExplicitWebFetchIntent(text: string): boolean {
  return (
    HTTP_URL_PATTERN.test(text) &&
    URL_FETCH_ACTION_PATTERN.test(text) &&
    !URL_FETCH_OPT_OUT_PATTERN.test(text)
  );
}
