import { CorpusUnavailableError, getSupportCorpus } from './agent/corpus';
import type { CorpusChunk } from './agent/types';
import { helpArticlePath } from './help-paths';

export { helpArticlePath };

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
    description: first.description ?? null,
    sections,
  };
}

export const PURCHASE_HELP_CATEGORY = 'billing';

export function purchaseHelpPaths(): string[] {
  const corpus = getSupportCorpus();
  if (!corpus.available) return [];
  const paths = new Set([`/help/collections/${PURCHASE_HELP_CATEGORY}`]);
  for (const chunk of corpus.chunks) {
    if (chunk.origin === 'markdown' && chunk.category === PURCHASE_HELP_CATEGORY) {
      paths.add(helpArticlePath(chunk.docId));
    }
  }
  return [...paths];
}
