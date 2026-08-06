/**
 * BM25 over an in-memory chunk index.
 *
 * Pure and I/O free so it can be exercised against a synthetic corpus in tests
 * without touching the real one. Lexical on purpose: the repo has no pgvector,
 * no embedding pipeline, and no embedding column, and "simple and inspectable"
 * is a requirement of this brief rather than a compromise — a reviewer can read
 * why a chunk was retrieved.
 */

import { tokenize } from './tokenize';

const K1 = 1.2;
const B = 0.75;

/**
 * Heading and curated tag terms are worth more than body terms: they are the
 * hand-written "what is this section about" signal, and boosting them is what
 * makes a two-word product question ("anthropic key") land on the right chunk
 * instead of on whichever long paragraph happens to repeat a word.
 */
const FIELD_BOOST = 2;

/** Small bonus when the raw normalized query appears verbatim in the chunk. */
const PHRASE_BONUS = 1.5;

export interface Bm25Document {
  id: string;
  /** Body text. */
  text: string;
  /** Heading path and curated tags — boosted. */
  boosted: string;
}

interface IndexedDocument {
  id: string;
  /** term -> boosted term frequency */
  termFrequencies: Map<string, number>;
  /** Boosted length, matching how `termFrequencies` was accumulated. */
  length: number;
  /** Lowercased, normalized full text for the exact-phrase bonus. */
  haystack: string;
}

export interface Bm25Index {
  documents: IndexedDocument[];
  documentFrequencies: Map<string, number>;
  averageLength: number;
  size: number;
}

export function buildBm25Index(documents: readonly Bm25Document[]): Bm25Index {
  const indexed: IndexedDocument[] = [];
  const documentFrequencies = new Map<string, number>();
  let totalLength = 0;

  for (const document of documents) {
    const termFrequencies = new Map<string, number>();
    let length = 0;

    const add = (value: string, weight: number): void => {
      for (const term of tokenize(value)) {
        termFrequencies.set(term, (termFrequencies.get(term) ?? 0) + weight);
        length += weight;
      }
    };
    add(document.text, 1);
    add(document.boosted, FIELD_BOOST);

    for (const term of termFrequencies.keys()) {
      documentFrequencies.set(term, (documentFrequencies.get(term) ?? 0) + 1);
    }
    totalLength += length;
    indexed.push({
      id: document.id,
      termFrequencies,
      length,
      haystack: `${document.boosted}\n${document.text}`.normalize('NFKC').toLowerCase(),
    });
  }

  return {
    documents: indexed,
    documentFrequencies,
    averageLength: indexed.length === 0 ? 0 : totalLength / indexed.length,
    size: indexed.length,
  };
}

/** Standard BM25 IDF with the +1 guard that keeps it non-negative. */
function idf(index: Bm25Index, term: string): number {
  const df = index.documentFrequencies.get(term) ?? 0;
  return Math.log(1 + (index.size - df + 0.5) / (df + 0.5));
}

export interface Bm25Hit {
  id: string;
  score: number;
  /** Distinct query terms this document matched. */
  matchedTerms: string[];
}

/**
 * Score every document against the query. Returns hits with a positive score,
 * sorted by score descending then by id so the ordering is stable.
 */
export function scoreBm25(index: Bm25Index, query: string): Bm25Hit[] {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0 || index.size === 0) return [];

  const phrase = query.normalize('NFKC').toLowerCase().trim();
  const usePhraseBonus = phrase.length >= 8;

  const hits: Bm25Hit[] = [];
  for (const document of index.documents) {
    let score = 0;
    const matchedTerms: string[] = [];
    for (const term of queryTerms) {
      const tf = document.termFrequencies.get(term);
      if (!tf) continue;
      matchedTerms.push(term);
      const denominator = tf + K1 * (1 - B + (B * document.length) / (index.averageLength || 1));
      score += idf(index, term) * ((tf * (K1 + 1)) / denominator);
    }
    if (score <= 0) continue;
    if (usePhraseBonus && document.haystack.includes(phrase)) score += PHRASE_BONUS;
    hits.push({ id: document.id, score, matchedTerms });
  }

  hits.sort((a, b) => (b.score === a.score ? (a.id < b.id ? -1 : 1) : b.score - a.score));
  return hits;
}
