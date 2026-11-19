import { CorpusUnavailableError, getSupportCorpus, type SupportCorpusView } from './agent/corpus';
import type { CorpusChunk } from './agent/types';
import { helpArticlePath } from './help-paths';

export { helpArticlePath };

export function helpResultPath(chunk: Pick<CorpusChunk, 'origin' | 'docId' | 'path'>): string {
  return chunk.origin === 'markdown' ? helpArticlePath(chunk.docId) : chunk.path;
}

export function getHelpArticle(docId: string, view: SupportCorpusView = 'web') {
  const corpus = getSupportCorpus(view);
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

function markdownChunks(view: SupportCorpusView): readonly CorpusChunk[] | null {
  const corpus = getSupportCorpus(view);
  if (!corpus.available) return null;
  return corpus.chunks.filter((chunk) => chunk.origin === 'markdown');
}

export function purchaseHelpPaths(): string[] {
  const web = markdownChunks('web');
  if (!web) return [];
  const phone = markdownChunks('phone') ?? [];
  const phoneDocs = new Set(phone.map((chunk) => chunk.docId));
  const phoneCategories = new Set(phone.map((chunk) => chunk.category));
  const collections = new Set<string>();
  const articles = new Set<string>();
  for (const chunk of web) {
    if (!phoneCategories.has(chunk.category)) {
      collections.add(`/help/collections/${chunk.category}`);
    }
    if (!phoneDocs.has(chunk.docId)) articles.add(helpArticlePath(chunk.docId));
  }
  return [...collections, ...articles];
}
