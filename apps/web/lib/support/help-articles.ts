import { CorpusUnavailableError, getSupportCorpus } from './agent/corpus';
import type { CorpusChunk } from './agent/types';

export function helpArticlePath(docId: string): string {
  return `/help/${encodeURIComponent(docId)}`;
}

export function helpResultPath(chunk: Pick<CorpusChunk, 'origin' | 'docId' | 'path'>): string {
  return chunk.origin === 'markdown' ? helpArticlePath(chunk.docId) : chunk.path;
}

export function getHelpArticle(docId: string) {
  const corpus = getSupportCorpus();
  if (!corpus.available) throw new CorpusUnavailableError(corpus.reason);
  const sections = corpus.chunks.filter(
    (chunk) => chunk.origin === 'markdown' && chunk.docId === docId,
  );
  const first = sections[0];
  if (!first) return null;
  return {
    id: docId,
    title: first.docTitle,
    relatedPath: first.path,
    updated: first.updated,
    sections,
  };
}
