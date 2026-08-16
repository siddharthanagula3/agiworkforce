
import { STATIC_ARTICLES, STATIC_FAQS } from '@/lib/support/static-data';
import type { CorpusChunk } from '../types';

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
