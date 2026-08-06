/**
 * Adapts the existing support-centre static data into corpus chunks.
 *
 * `lib/support/static-data.ts` already holds published FAQs and articles and
 * had no runtime consumer; the support agent becomes its first. It is IMPORTED,
 * not rewritten — rewriting it into a re-export would silently hollow out the
 * existing string assertion in `lib/__tests__/public-billing-copy.test.ts`.
 *
 * Only `is_published: true` FAQs are indexed. This is product documentation, not
 * user content: no database is read here or anywhere else in this subtree.
 */

import { STATIC_ARTICLES, STATIC_FAQS } from '@/lib/support/static-data';
import type { CorpusChunk } from '../types';

/**
 * Where each static record's citation points. Static data carries no route of
 * its own, so the mapping is declared here against real public pages and pinned
 * by `authoritative-links.test.ts`.
 */
const FAQ_CATEGORY_PATHS: Record<string, string> = {
  'getting-started': '/help',
  billing: '/pricing',
  privacy: '/privacy',
  features: '/faq',
};

const ARTICLE_CATEGORY_PATHS: Record<string, string> = {
  'getting-started': '/help',
  providers: '/providers',
  features: '/faq',
};

const FALLBACK_PATH = '/support';

/** Strip markdown headings/formatting so indexed text is prose, not syntax. */
function flattenMarkdown(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s+/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildStaticDataChunks(): CorpusChunk[] {
  const chunks: CorpusChunk[] = [];

  for (const faq of STATIC_FAQS) {
    if (!faq.is_published) continue;
    chunks.push({
      id: `static-faq:${faq.id}`,
      docId: `static-faq:${faq.id}`,
      docTitle: faq.question,
      path: FAQ_CATEGORY_PATHS[faq.category] ?? FALLBACK_PATH,
      category: faq.category,
      tags: [faq.category, 'faq'],
      heading: faq.question,
      headingPath: `FAQ › ${faq.question}`,
      text: `${faq.question}\n\n${faq.answer}`,
      origin: 'static-data',
    });
  }

  for (const article of STATIC_ARTICLES) {
    chunks.push({
      id: `static-article:${article.id}`,
      docId: `static-article:${article.id}`,
      docTitle: article.title,
      path: ARTICLE_CATEGORY_PATHS[article.category_id] ?? FALLBACK_PATH,
      category: article.category_id,
      tags: [article.category_id, 'article', article.slug],
      heading: article.title,
      headingPath: `Support article › ${article.title}`,
      text: `${article.excerpt}\n\n${flattenMarkdown(article.content)}`,
      origin: 'static-data',
    });
  }

  return chunks;
}
