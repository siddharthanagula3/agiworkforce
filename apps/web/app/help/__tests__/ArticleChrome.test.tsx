import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/docs/components/DocsShell', () => ({
  DocsShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@shared/components/seo/JsonLd', () => ({
  JsonLd: ({ data }: { data: Record<string, unknown>[] }) =>
    data.map((block, index) => (
      <script key={index} type="application/ld+json">
        {JSON.stringify(block)}
      </script>
    )),
}));

import { docsNavGroups } from '@/features/docs/lib/docs-nav';
import { getHelpArticle, helpArticlePath } from '@/lib/support/help-articles';

import HelpArticlePage from '../[slug]/page';

const { links: ACCOUNT_LINKS } = docsNavGroups().find((group) => group.id === 'account') ?? {
  links: [],
};
const ARTICLE_ID = ACCOUNT_LINKS[0]?.href.split('/').pop() ?? '';

async function renderArticle(slug: string) {
  return render(await HelpArticlePage({ params: Promise.resolve({ slug }) }));
}

describe('help article page chrome', () => {
  it('describes the visible article and breadcrumb with the same canonical identity', async () => {
    const { container } = await renderArticle(ARTICLE_ID);
    const blocks = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
      (script) => JSON.parse(script.textContent ?? '{}') as Record<string, unknown>,
    );
    const article = getHelpArticle(ARTICLE_ID);
    expect(article).not.toBeNull();
    expect(blocks.find((block) => block['@type'] === 'Article')).toMatchObject({
      headline: container.querySelector('h1')?.textContent,
      description: container.querySelector('.dx-desc')?.textContent,
      dateModified: article?.updated,
    });
    const breadcrumb = blocks.find((block) => block['@type'] === 'BreadcrumbList');
    const items = breadcrumb?.['itemListElement'] as { item: string; name: string }[];
    expect(items.at(-1)?.name).toBe(article?.title);
    expect(items.at(-1)?.item).toMatch(new RegExp(`${helpArticlePath(ARTICLE_ID)}$`));
  });

  it('ends the breadcrumb with the unlinked article title', async () => {
    const { container } = await renderArticle(ARTICLE_ID);
    const crumbs = Array.from(container.querySelectorAll('nav[aria-label="Breadcrumb"] li'));
    const last = crumbs.at(-1);

    expect(crumbs.length).toBeGreaterThanOrEqual(3);
    expect(last?.textContent).toBe(getHelpArticle(ARTICLE_ID)?.title);
    expect(last?.getAttribute('aria-current')).toBe('page');
    expect(last?.querySelector('a')).toBeNull();
  });

  it('renders the article description as the lede between the title and the meta line', async () => {
    const { container } = await renderArticle(ARTICLE_ID);
    const lede = container.querySelector('.dx-desc');

    expect(getHelpArticle(ARTICLE_ID)?.description).toBeTruthy();
    expect(lede?.textContent).toBe(getHelpArticle(ARTICLE_ID)?.description);
    expect(lede?.previousElementSibling?.classList.contains('dx-head')).toBe(true);
    expect(lede?.nextElementSibling?.classList.contains('dx-meta')).toBe(true);
  });

  it('gives every article a description', () => {
    for (const link of docsNavGroups().flatMap((group) => group.links)) {
      if (!link.href.startsWith('/help/')) continue;
      expect(getHelpArticle(link.href.split('/').pop() ?? '')?.description, link.href).toBeTruthy();
    }
  });

  it('renders the feedback block, support cards and related articles after the body', async () => {
    const { container } = await renderArticle(ARTICLE_ID);
    const body = container.querySelector('.dx-prose');
    const feedback = container.querySelector('.dx-feedback');
    const related = container.querySelector('#help-article-related');

    expect(feedback?.textContent).toContain('Was this article helpful?');
    expect(container.querySelector('#help-article-support')?.textContent).toBe('Need more help?');
    expect(related).not.toBeNull();
    expect(body?.compareDocumentPosition(feedback as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('draws related articles from the same corpus group and never the article itself', async () => {
    const { container } = await renderArticle(ARTICLE_ID);
    const hrefs = Array.from(container.querySelectorAll('.dx-related-link')).map((link) =>
      link.getAttribute('href'),
    );
    const siblings = ACCOUNT_LINKS.map((link) => link.href);

    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.length).toBeLessThanOrEqual(3);
    expect(hrefs).not.toContain(helpArticlePath(ARTICLE_ID));
    for (const href of hrefs) expect(siblings).toContain(href);
  });
});
