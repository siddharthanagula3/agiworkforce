/**
 * Citation parsing for the research and search suites.
 *
 * @module evals/citations
 * @packageDocumentation
 */

const CITATION_GROUP = /\[((?:[A-Za-z]?\d+)(?:\s*,\s*[A-Za-z]?\d+)*)\]/gu;
const SENTENCE_BREAK = /(?<=[.!?](?:\s*\[[^\]\n]+\])*)\s+(?!\[)|\n+/u;
const URL_PATTERN = /https?:\/\/[^\s)\]>"'`]+/gu;

export function citedIds(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(CITATION_GROUP)) {
    for (const id of (match[1] ?? '').split(',')) ids.push(id.trim());
  }
  return ids;
}

export function sentences(text: string): string[] {
  return text
    .split(SENTENCE_BREAK)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function claimCitesSource(text: string, claim: string, source: string): boolean {
  const pattern = new RegExp(claim, 'iu');
  return sentences(text).some(
    (sentence) => pattern.test(sentence) && citedIds(sentence).includes(source),
  );
}

export function normaliseUrl(url: string): string {
  return url.replace(/[.,;:!?]+$/u, '').replace(/\/+$/u, '');
}

export function citedUrls(text: string): string[] {
  return [...new Set((text.match(URL_PATTERN) ?? []).map(normaliseUrl))];
}
