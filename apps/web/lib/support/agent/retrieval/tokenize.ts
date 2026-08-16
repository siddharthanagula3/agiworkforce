
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

const SHORT_TERM_ALLOWLIST = new Set(['ai', 'api', 'cli', 'mcp', 'byok', 'key', 'llm', 'us', 'eu']);

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

export function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

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

export function uniqueTokens(value: string): string[] {
  return [...new Set(tokenize(value))];
}
