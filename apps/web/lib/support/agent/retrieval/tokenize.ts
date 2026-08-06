/**
 * The ONE tokenizer for the support corpus.
 *
 * Used for both indexed chunk text and the incoming query, so the two can never
 * drift. Deliberately boring and dependency-free: NFKC normalize, lowercase,
 * strip punctuation, drop stopwords, fold a few English suffixes. No stemmer
 * library, no language detection, no embeddings.
 *
 * Pure — no I/O, no environment access, no globals.
 */

/**
 * A small closed stoplist. Kept short on purpose: an aggressive list starts
 * eating real query signal ("how do I delete my data" loses "delete" nothing,
 * but "no" and "not" carry meaning in support questions, so they stay).
 */
const STOPWORDS = new Set([
  'a',
  'about',
  'after',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'can',
  'did',
  'do',
  'does',
  'doing',
  'for',
  'from',
  'get',
  'had',
  'has',
  'have',
  'he',
  'her',
  'here',
  'hers',
  'him',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'me',
  'more',
  'most',
  'my',
  'of',
  'on',
  'or',
  'our',
  'out',
  'over',
  'own',
  'please',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'to',
  'too',
  'up',
  'us',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
]);

/** Words short enough to be noise unless they are known product terms. */
const SHORT_TERM_ALLOWLIST = new Set(['ai', 'api', 'cli', 'mcp', 'byok', 'key', 'llm', 'us', 'eu']);

/**
 * Fold a handful of English suffixes. Not a stemmer — just enough that
 * "providers"/"provider" and "billing"/"bill" collide. Guarded by a minimum
 * length so short product terms survive intact.
 */
function fold(term: string): string {
  if (term.length > 4 && term.endsWith('ies')) return `${term.slice(0, -3)}y`;
  if (term.length > 4 && (term.endsWith('ses') || term.endsWith('xes') || term.endsWith('ches'))) {
    return term.slice(0, -2);
  }
  if (term.length > 3 && term.endsWith('s') && !term.endsWith('ss')) return term.slice(0, -1);
  if (term.length > 5 && term.endsWith('ing')) return term.slice(0, -3);
  if (term.length > 5 && term.endsWith('ed')) return term.slice(0, -2);
  return term;
}

/** Normalize without tokenizing — shared by the tokenizer and the sanitizer. */
export function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

/**
 * Tokenize into folded content terms. Stopwords and 1-2 character tokens are
 * dropped unless the token is a known product term.
 */
export function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  const rawTerms = normalized.split(/[^a-z0-9+]+/u);
  const terms: string[] = [];
  for (const raw of rawTerms) {
    if (!raw) continue;
    if (STOPWORDS.has(raw)) continue;
    if (raw.length < 3 && !SHORT_TERM_ALLOWLIST.has(raw)) continue;
    terms.push(fold(raw));
  }
  return terms;
}

/** Distinct tokens, order preserved. */
export function uniqueTokens(value: string): string[] {
  return [...new Set(tokenize(value))];
}
