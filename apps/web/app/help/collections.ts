import { getSupportCorpus } from '@/lib/support/agent/corpus';

export interface SupportCollectionArticle {
  docId: string;
  title: string;
  href: string;
}

export interface SupportCollection {
  id: string;
  label: string;
  articles: readonly SupportCollectionArticle[];
}

export interface SupportCollectionIndex {
  collections: readonly SupportCollection[];
  articleCount: number;
}

function label(categoryId: string): string {
  const spaced = categoryId.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function supportCollectionIndex(): SupportCollectionIndex {
  const corpus = getSupportCorpus();
  if (!corpus.available) return { collections: [], articleCount: 0 };

  const byCategory = new Map<string, Map<string, SupportCollectionArticle>>();
  for (const chunk of corpus.chunks) {
    if (chunk.origin !== 'markdown') continue;
    const articles = byCategory.get(chunk.category) ?? new Map();
    byCategory.set(chunk.category, articles);
    if (!articles.has(chunk.docId)) {
      articles.set(chunk.docId, { docId: chunk.docId, title: chunk.docTitle, href: chunk.path });
    }
  }

  const collections = [...byCategory.entries()]
    .map(([id, articles]) => ({
      id,
      label: label(id),
      articles: [...articles.values()].sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    collections,
    articleCount: collections.reduce((total, entry) => total + entry.articles.length, 0),
  };
}
