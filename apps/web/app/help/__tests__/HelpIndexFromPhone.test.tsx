import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMBEDDED_PAGE_PARAM, EMBEDDED_PAGE_PARAM_VALUE } from '@agiworkforce/types';

type NavigationModule = typeof import('next/navigation');
type AgiMarkModule = typeof import('@shared/components/agi/AgiMark');
type MarketingFooterModule = typeof import('@/features/marketing/components/MarketingFooter');
type HelpSearchModule = typeof import('@/features/support/components/HelpSearch');

const route = vi.hoisted(() => ({ search: '' }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<NavigationModule>()),
  usePathname: () => '/help',
  useSearchParams: () => new URLSearchParams(route.search),
}));
vi.mock('@shared/components/agi/AgiMark', async (importOriginal) => ({
  ...(await importOriginal<AgiMarkModule>()),
  AgiMark: () => null,
}));
vi.mock('@/features/marketing/components/MarketingFooter', async (importOriginal) => ({
  ...(await importOriginal<MarketingFooterModule>()),
  MarketingFooter: () => null,
}));
vi.mock('@/features/support/components/HelpSearch', async (importOriginal) => ({
  ...(await importOriginal<HelpSearchModule>()),
  HelpSearch: () => null,
}));

import { EmbeddedPageProvider } from '@shared/components/layout/EmbeddedPage';
import { CONTACT_EMAIL } from '@/lib/legal-constants';
import {
  findPurchaseVocabulary,
  PURCHASE_HELP_CATEGORY,
} from '../../../scripts/lib/support-purchase-passages.mjs';

import { supportCollectionIndex } from '../collections';
import HelpLayout from '../layout';
import HelpPage from '../page';

const TIER_SENTENCE = 'what each tier can expect';
const PLAN_CLAUSE = 'unless your plan says otherwise';

async function renderHelp(fromPhone: boolean) {
  route.search = fromPhone ? `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}` : '';
  const searchParams = fromPhone ? { [EMBEDDED_PAGE_PARAM]: EMBEDDED_PAGE_PARAM_VALUE } : {};
  return render(
    <EmbeddedPageProvider>
      <HelpLayout>{await HelpPage({ searchParams: Promise.resolve(searchParams) })}</HelpLayout>
    </EmbeddedPageProvider>,
  );
}

function purchaseCollection() {
  const index = supportCollectionIndex();
  const purchase = index.collections.find((entry) => entry.id === PURCHASE_HELP_CATEGORY);
  expect(purchase).toBeDefined();
  expect(purchase?.articles.length).toBeGreaterThan(0);
  return { index, purchase: purchase ?? { label: '', articles: [] } };
}

afterEach(() => {
  route.search = '';
});

describe('the help index', () => {
  it('lists the purchase collection and the tier sentence on the web', async () => {
    const { index, purchase } = purchaseCollection();
    const { container } = await renderHelp(false);
    const text = container.textContent ?? '';

    expect(text).toContain(purchase.label);
    for (const article of purchase.articles) expect(text).toContain(article.title);
    expect(text).toContain(TIER_SENTENCE);
    expect(text).toContain(PLAN_CLAUSE);
    expect(text).toContain(
      `${index.articleCount} articles across ${index.collections.length} collections`,
    );
  });

  it('opened from the phone, shows no purchase collection, its titles or the tier sentence', async () => {
    const { index, purchase } = purchaseCollection();
    const { container } = await renderHelp(true);
    const text = container.textContent ?? '';
    const { collections: shown, articleCount: shownArticles } = supportCollectionIndex('phone');
    expect(index.articleCount).toBeGreaterThan(shownArticles);

    expect(text).not.toContain(purchase.label);
    for (const article of purchase.articles) expect(text).not.toContain(article.title);
    expect(text).not.toContain(TIER_SENTENCE);
    expect(text).not.toContain(PLAN_CLAUSE);
    expect(text).toContain(CONTACT_EMAIL);
    expect(text).toContain(`${shownArticles} articles across ${shown.length} collections`);
    for (const entry of shown) expect(text).toContain(entry.label);
    expect(findPurchaseVocabulary(text)).toBeNull();
  });
});
