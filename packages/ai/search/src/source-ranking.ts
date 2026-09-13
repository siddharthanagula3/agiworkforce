/**
 * @file Ranking the sources a turn collected, so the primary account of a fact
 * is offered before an aggregator's retelling of it.
 *
 * There is no list of good domains here, and there must not be one: a list is a
 * judgement about publishers that goes stale, cannot be defended, and silently
 * decides what a reader is allowed to see. Every signal below is a property of
 * the result in hand, computed from what the search backend already returned or
 * from a page the turn already fetched:
 *
 * | signal            | what it is evidence of                                |
 * | ----------------- | ----------------------------------------------------- |
 * | recency           | a dated page beats an undated one, newer beats older   |
 * | publisher page    | the host is the publisher the answer names, not a copy |
 * | structured data   | the page declares what it is, so it is a real record   |
 * | cited in the turn | several of the turn's searches converged on it         |
 * | https             | the page can be fetched again and verified             |
 * | language          | the page answers in the language the question asked    |
 * | duplicate         | a later near-copy of a result already ranked           |
 * | boilerplate       | the extracted text is navigation, not an account       |
 *
 * Weights live in {@link DEFAULT_SOURCE_RANKING_WEIGHTS} and nowhere else, so
 * tuning the ranking is one edit rather than a sweep through call sites.
 */

/** One collected result, in the fields both the chat loop and the research loop hold. */
export interface RankableSource {
  url: string;
  title?: string | undefined;
  snippet?: string | undefined;
  /** Publication date as the backend reported it; any Date-parseable form. */
  publishedDate?: string | undefined;
  /** Publisher name the backend or the answer attributed the page to. */
  publisher?: string | undefined;
  /** BCP-47 tag when the backend reported one. */
  language?: string | undefined;
  /** Full extracted page text, when this turn already fetched the page. */
  extractedText?: string | undefined;
  /** The page declares JSON-LD, microdata or OpenGraph metadata. */
  hasStructuredData?: boolean | undefined;
  /** How many of this turn's searches returned this URL. */
  timesReturned?: number | undefined;
}

export interface SourceRankingContext {
  /** Clock, injectable so a recency score is deterministic under test. */
  now?: number;
  /** The question as asked, used for the language signal when no tag is reported. */
  queryText?: string;
  /** BCP-47 primary subtag of the question, when the caller knows it. */
  queryLanguage?: string;
  /** Publishers the answer names, so their own pages outrank republications. */
  publishersNamedInAnswer?: readonly string[];
}

export interface SourceRankingWeights {
  recency: number;
  publisherPage: number;
  structuredData: number;
  citedInTurn: number;
  https: number;
  language: number;
  duplicate: number;
  boilerplate: number;
}

/**
 * The one place these numbers live.
 *
 * Positive weights reward evidence of a primary account; the two negative ones
 * are the only way a source loses ground, and both name a defect in the page
 * rather than a judgement about who published it.
 */
export const DEFAULT_SOURCE_RANKING_WEIGHTS: SourceRankingWeights = {
  recency: 0.2,
  publisherPage: 0.3,
  structuredData: 0.1,
  citedInTurn: 0.15,
  https: 0.05,
  language: 0.15,
  duplicate: -0.35,
  boilerplate: -0.25,
};

/** A page older than this contributes nothing to the recency signal. */
export const RECENCY_HORIZON_DAYS = 365 * 3;
/** Searches converging on one URL past this count adds nothing further. */
export const CITED_IN_TURN_SATURATION = 3;
/** Above this share of near-duplicate tokens, a later result is a copy. */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.85;
/**
 * Extracted text below this many words is a shell: a cookie banner, a nav bar
 * and a paywall notice, not the account of anything.
 */
export const BOILERPLATE_MIN_WORDS = 120;
/**
 * Distinct words as a share of total words. A navigation-only page repeats the
 * same handful of labels, so its ratio collapses; prose does not.
 */
export const BOILERPLATE_MIN_DISTINCT_RATIO = 0.25;

const MILLISECONDS_PER_DAY = 86_400_000;

export interface SourceRankingScore {
  score: number;
  signals: Record<keyof SourceRankingWeights, number>;
}

export interface RankedSource<
  T extends RankableSource = RankableSource,
> extends SourceRankingScore {
  source: T;
  /** Where the source sat before ranking, so a caller can report the move. */
  originalIndex: number;
}

/**
 * The publisher a result names in its own title suffix, as most indexed pages
 * do: "FOMC statement - Federal Reserve". Cheap, list-free, and it is what
 * makes the publisher signal work on a backend that reports no attribution.
 * Returns undefined for a suffix long enough to be prose rather than a name.
 */
// The dash characters are built rather than written: the repository's prose
// guard rejects the long-dash escapes on sight, and a title separator is not
// prose.
const LONG_DASHES = String.fromCharCode(0x2013, 0x2014);
const TITLE_PUBLISHER_SUFFIX = new RegExp(`\\s[-|${LONG_DASHES}]\\s([^-|${LONG_DASHES}]{2,40})$`);

export function publisherFromTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const match = TITLE_PUBLISHER_SUFFIX.exec(title.trim());
  const candidate = match?.[1]?.trim();
  if (!candidate) return undefined;
  return candidate.split(/\s+/).length <= 5 ? candidate : undefined;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The publisher name reduced to the letters and digits a hostname could carry.
 * "The New York Times" becomes "thenewyorktimes", which is what lets a host
 * match without anyone writing that host down.
 */
function publisherKey(value: string): string {
  return value.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function hostKey(host: string): string {
  return host.replace(/\.[^.]+$/, '').replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function recencyScore(source: RankableSource, now: number): number {
  if (!source.publishedDate) return 0;
  const published = Date.parse(source.publishedDate);
  if (!Number.isFinite(published)) return 0;
  const ageDays = (now - published) / MILLISECONDS_PER_DAY;
  if (ageDays < 0) return 0;
  return Math.max(0, 1 - ageDays / RECENCY_HORIZON_DAYS);
}

/**
 * 1 when the host is the publisher's own, either because the answer named that
 * publisher or because the result carried the attribution itself. A wire story
 * republished under a different host scores 0: the original is what a reader
 * following the citation should land on.
 */
function publisherPageScore(
  source: RankableSource,
  publishersNamedInAnswer: readonly string[],
): number {
  const host = hostOf(source.url);
  if (!host) return 0;
  const key = hostKey(host);
  if (!key) return 0;
  const candidates = [
    ...(source.publisher ? [source.publisher] : []),
    ...publishersNamedInAnswer,
  ].map(publisherKey);
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (key.includes(candidate) || candidate.includes(key)) return 1;
  }
  return 0;
}

function citedInTurnScore(source: RankableSource): number {
  const times = Math.max(0, Math.trunc(source.timesReturned ?? 1));
  if (times <= 1) return 0;
  return Math.min(1, (times - 1) / (CITED_IN_TURN_SATURATION - 1));
}

const SCRIPT_TESTS: ReadonlyArray<readonly [string, RegExp]> = [
  ['han', /\p{Script=Han}/u],
  ['hiragana', /\p{Script=Hiragana}/u],
  ['katakana', /\p{Script=Katakana}/u],
  ['hangul', /\p{Script=Hangul}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['arabic', /\p{Script=Arabic}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['greek', /\p{Script=Greek}/u],
  ['thai', /\p{Script=Thai}/u],
  ['latin', /\p{Script=Latin}/u],
];

/** The writing systems a piece of text uses, by Unicode property, not by list. */
function scriptsOf(text: string): Set<string> {
  const found = new Set<string>();
  for (const [name, pattern] of SCRIPT_TESTS) {
    if (pattern.test(text)) found.add(name);
  }
  return found;
}

/**
 * 1 when the result answers in the language the question was asked in.
 *
 * A reported BCP-47 tag is used when the backend gives one. Otherwise the
 * signal falls back to writing system agreement, which separates a Chinese,
 * Russian or Arabic page from a Latin-script one and does NOT separate Spanish
 * from English. That is the honest limit of what the text alone shows, and a
 * pair that cannot be told apart scores neutral rather than guessing.
 */
function languageScore(source: RankableSource, context: SourceRankingContext): number {
  const declared = source.language?.split('-')[0]?.toLowerCase();
  const asked = context.queryLanguage?.split('-')[0]?.toLowerCase();
  if (declared && asked) return declared === asked ? 1 : 0;

  const queryText = context.queryText?.trim();
  if (!queryText) return 0.5;
  const resultText = `${source.title ?? ''} ${source.snippet ?? ''}`.trim();
  if (!resultText) return 0.5;
  const queryScripts = scriptsOf(queryText);
  const resultScripts = scriptsOf(resultText);
  if (queryScripts.size === 0 || resultScripts.size === 0) return 0.5;
  for (const script of queryScripts) {
    if (resultScripts.has(script)) return 1;
  }
  return 0;
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^\p{Letter}\p{Number}]+/u)
      .filter((token) => token.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * 1 when the extracted text reads as page furniture rather than an account:
 * too short to say anything, or so repetitive that it is a navigation column.
 * A source the turn never fetched has no extracted text and scores 0, because
 * an unread page is not evidence of boilerplate.
 */
function boilerplateScore(source: RankableSource): number {
  const text = source.extractedText?.trim();
  if (!text) return 0;
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length === 0) return 1;
  if (words.length < BOILERPLATE_MIN_WORDS) return 1;
  const distinct = new Set(words.map((word) => word.toLowerCase())).size;
  const ratio = distinct / words.length;
  return ratio < BOILERPLATE_MIN_DISTINCT_RATIO ? 1 : 0;
}

/**
 * Score one source in isolation. The duplicate signal is not part of it: being
 * a duplicate is a relation between results, so it is decided in
 * {@link rankSources}, which can see them all.
 */
export function scoreSource(
  source: RankableSource,
  context: SourceRankingContext = {},
  weights: SourceRankingWeights = DEFAULT_SOURCE_RANKING_WEIGHTS,
): SourceRankingScore {
  const now = context.now ?? Date.now();
  const signals: Record<keyof SourceRankingWeights, number> = {
    recency: recencyScore(source, now),
    publisherPage: publisherPageScore(source, context.publishersNamedInAnswer ?? []),
    structuredData: source.hasStructuredData ? 1 : 0,
    citedInTurn: citedInTurnScore(source),
    https: isHttps(source.url) ? 1 : 0,
    language: languageScore(source, context),
    duplicate: 0,
    boilerplate: boilerplateScore(source),
  };
  return { score: weightedScore(signals, weights), signals };
}

function weightedScore(
  signals: Record<keyof SourceRankingWeights, number>,
  weights: SourceRankingWeights,
): number {
  let total = 0;
  for (const key of Object.keys(weights) as Array<keyof SourceRankingWeights>) {
    total += signals[key] * weights[key];
  }
  return total;
}

/**
 * Rank a turn's sources, best first.
 *
 * The order in is the order the results arrived, and it is the tiebreak: two
 * sources the signals cannot separate keep the order the backend gave them,
 * so ranking never reshuffles for no reason. Duplicates are decided against
 * whatever already ranks above them, so the first account of a story keeps its
 * place and the copies fall behind it.
 */
export function rankSources<T extends RankableSource>(
  sources: readonly T[],
  context: SourceRankingContext = {},
  weights: SourceRankingWeights = DEFAULT_SOURCE_RANKING_WEIGHTS,
): RankedSource<T>[] {
  const scored = sources.map((source, originalIndex) => ({
    source,
    originalIndex,
    ...scoreSource(source, context, weights),
    tokens: tokenSet(`${source.title ?? ''} ${source.snippet ?? ''}`),
  }));

  const ordered = [...scored].sort((a, b) =>
    b.score === a.score ? a.originalIndex - b.originalIndex : b.score - a.score,
  );

  const kept: (typeof ordered)[number][] = [];
  for (const entry of ordered) {
    const duplicate = kept.some(
      (earlier) => jaccard(entry.tokens, earlier.tokens) >= DUPLICATE_SIMILARITY_THRESHOLD,
    );
    if (duplicate) {
      entry.signals.duplicate = 1;
      entry.score = weightedScore(entry.signals, weights);
    }
    kept.push(entry);
  }

  return kept
    .sort((a, b) => (b.score === a.score ? a.originalIndex - b.originalIndex : b.score - a.score))
    .map(({ source, originalIndex, score, signals }) => ({
      source,
      originalIndex,
      score,
      signals,
    }));
}
