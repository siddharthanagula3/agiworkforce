import { expect, test } from '@playwright/test';

import { supportCollectionIndex } from '../app/help/collections';
import { SUBSCRIPTION_GUIDE } from '../lib/blog-posts';
import { getHelpArticle, helpArticlePath } from '../lib/support/help-articles';

test.use({ reducedMotion: 'reduce' });

test('discovers help collections through a valid sitemap and their canonical pages', async ({
  page,
  request,
}) => {
  const response = await request.get('/sitemap.xml', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('xml');
  const xml = await response.text();
  const sitemap = await page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, 'application/xml');
    return {
      root: document.documentElement.localName,
      namespace: document.documentElement.namespaceURI,
      errors: document.querySelectorAll('parsererror').length,
      urls: [...document.getElementsByTagName('loc')].map((node) => node.textContent ?? ''),
    };
  }, xml);
  expect(sitemap.errors).toBe(0);
  expect(sitemap.root).toBe('urlset');
  expect(sitemap.namespace).toBe('http://www.sitemaps.org/schemas/sitemap/0.9');
  expect(new Set(sitemap.urls).size).toBe(sitemap.urls.length);

  const { collections } = supportCollectionIndex();
  expect(collections.length).toBeGreaterThan(0);
  for (const collection of collections) {
    await test.step(collection.label, async () => {
      const path = `/help/collections/${collection.id}`;
      const canonical = sitemap.urls.find((url) => new URL(url).pathname === path);
      expect(canonical, `${path} must appear in the sitemap`).toBeDefined();
      const pageResponse = await page.goto(path);
      expect(pageResponse?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical!);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical!);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bindex\b/);
      await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute('content', /noindex/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(collection.label);
      await expect(
        page.locator('main a').filter({ hasText: collection.articles[0]!.title }),
      ).toHaveAttribute('href', collection.articles[0]!.href);
      for (const article of collection.articles) {
        await expect(page.locator(`main a[href="${article.href}"]`)).toHaveCount(1);
        expect(sitemap.urls).toContain(new URL(article.href, canonical).href);
        const articleResponse = await request.get(article.href, { maxRedirects: 0 });
        expect(articleResponse.status(), article.href).toBe(200);
      }
    });
  }
});

test('keeps article update metadata consistent with rendered content and JSON-LD', async ({
  page,
}) => {
  const help = getHelpArticle('getting-started');
  expect(help).not.toBeNull();
  if (!help) throw new Error('The getting-started help article must be available.');
  const articles = [{ ...help, path: helpArticlePath(help.id) }, SUBSCRIPTION_GUIDE];

  for (const article of articles) {
    await test.step(article.path, async () => {
      expect((await page.goto(article.path))?.status()).toBe(200);
      await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
      await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute(
        'content',
        article.updated,
      );
      await expect(page.locator('meta[property="article:published_time"]')).toHaveCount(0);
      const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
      const structuredArticle = schemas
        .map((source) => JSON.parse(source) as Record<string, unknown>)
        .find((schema) => schema['@type'] === 'Article');
      expect(structuredArticle).toMatchObject({
        headline: article.title,
        dateModified: article.updated,
      });
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(structuredArticle?.['mainEntityOfPage']).toBe(canonical);
      if (article.path === SUBSCRIPTION_GUIDE.path) {
        await expect(page.locator('time')).toHaveAttribute('datetime', article.updated);
      } else {
        await expect(page.locator('main')).toContainText(`Updated ${article.updated}`);
      }
    });
  }
});

test('returns a crawler-visible 404 for nonexistent help and blog destinations', async ({
  request,
}) => {
  for (const path of [
    '/help/seo-nonexistent-article',
    '/help/collections/seo-nonexistent-collection',
    '/blog/seo-nonexistent-guide',
  ]) {
    const response = await request.get(path, {
      headers: { 'User-Agent': 'Googlebot' },
      maxRedirects: 0,
    });
    expect(response.status(), path).toBe(404);
    expect(await response.text(), path).toMatch(/noindex/);
  }
});
