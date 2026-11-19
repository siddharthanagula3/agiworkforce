import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PURCHASE_HELP_CATEGORY,
  getHelpArticle,
  helpArticlePath,
} from '@/lib/support/help-articles';

const CONTENT_DIR = join(__dirname, '..', '..', '..', 'content', 'support');
const ARTICLE_ID = 'getting-started';
const SELLING_WORDS = /\bupgrad(?:e|es|ing)\b|\bpric(?:e|es|ing)\b|\bplans?\b/iu;

function articleSource(docId: string): string {
  return readFileSync(join(CONTENT_DIR, `${docId}.md`), 'utf8');
}

function articleBody(source: string): string {
  const end = source.indexOf('\n---\n', 3);
  return end === -1 ? source : source.slice(end + 5);
}

function frontmatterValue(source: string, key: string): string | null {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'mu').exec(source);
  return match?.[1]?.trim() ?? null;
}

function purchaseHelpArticlePaths(): string[] {
  return readdirSync(CONTENT_DIR)
    .filter((name) => name.endsWith('.md'))
    .filter(
      (name) =>
        frontmatterValue(readFileSync(join(CONTENT_DIR, name), 'utf8'), 'category') ===
        PURCHASE_HELP_CATEGORY,
    )
    .map((name) => helpArticlePath(name.replace(/\.md$/u, '')));
}

const LINK_PATTERNS = [
  /\]\(([^)\s]+)\)/gu,
  /^\s*\[[^\]]+\]:\s*(\S+)/gmu,
  /<((?:https?:)?\/[^>\s]*)>/gu,
  /(https?:\/\/[^\s)<>\]]+)/gu,
];

function linkedPaths(text: string): string[] {
  const hrefs = LINK_PATTERNS.flatMap((pattern) =>
    Array.from(text.matchAll(pattern), (match) => match[1] ?? ''),
  );
  return [
    ...new Set(
      hrefs.map(
        (href) => new URL(href, 'https://help.invalid').pathname.replace(/\/+$/u, '') || '/',
      ),
    ),
  ];
}

function expectNoPurchaseLinks(text: string) {
  const purchasePaths = purchaseHelpArticlePaths();
  expect(purchasePaths.length).toBeGreaterThan(0);
  const links = linkedPaths(text);
  expect(links.length).toBeGreaterThan(0);
  for (const path of links) {
    expect(path).not.toBe('/pricing');
    expect(purchasePaths).not.toContain(path);
  }
}

describe('getting started article', () => {
  const body = articleBody(articleSource(ARTICLE_ID));

  it('finds every kind of markdown link to a pricing page', () => {
    expect(linkedPaths('[Plans](https://agiworkforce.com/pricing)')).toEqual(['/pricing']);
    expect(linkedPaths('[Plans][p]\n\n[p]: https://agiworkforce.com/pricing')).toContain(
      '/pricing',
    );
    expect(linkedPaths('See <https://agiworkforce.com/pricing>.')).toEqual(['/pricing']);
    expect(linkedPaths('See https://agiworkforce.com/pricing/ today.')).toEqual(['/pricing']);
    expect(linkedPaths('[Plans](/pricing)')).toEqual(['/pricing']);
  });

  it('links to no pricing page and no purchase help article', () => {
    expectNoPurchaseLinks(body);
  });

  it('tells the reader nothing about plans, prices or upgrades', () => {
    expect(body).not.toMatch(SELLING_WORDS);
  });

  it('serves readers the same text without plans, prices or upgrades', () => {
    const article = getHelpArticle(ARTICLE_ID);
    expect(article).not.toBeNull();
    const served = (article?.sections ?? []).map((section) => section.text).join('\n\n');
    expect(served.length).toBeGreaterThan(0);
    expect(served).not.toMatch(SELLING_WORDS);
    expectNoPurchaseLinks(served);
  });
});
