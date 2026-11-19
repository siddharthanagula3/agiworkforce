import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDED_PAGE_PARAM,
  EMBEDDED_PAGE_PARAM_VALUE,
  isEmbeddableAccountPagePath,
  isEmbeddablePagePath,
} from '@agiworkforce/types';

type NavigationModule = typeof import('next/navigation');

const route = vi.hoisted(() => ({ pathname: '/', search: '' }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<NavigationModule>()),
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));

import { GET } from '@/app/api/help/search/route';
import { HelpSearch } from '@/features/support/components/HelpSearch';
import { CONTACT_EMAIL } from '@/lib/legal-constants';
import { getSupportCorpus } from '@/lib/support/agent/corpus';
import { EmbeddedPageProvider } from '@shared/components/layout/EmbeddedPage';
import {
  findPurchaseVocabulary,
  PURCHASE_HELP_CATEGORY,
} from '../../../scripts/lib/support-purchase-passages.mjs';

import HelpLayout from '../layout';
import HelpPage from '../page';
import HelpArticlePage from '../[slug]/page';
import HelpCollectionPage from '../collections/[id]/page';
import {
  HELP_UNAVAILABLE_ON_PHONE_LINK,
  HELP_UNAVAILABLE_ON_PHONE_TITLE,
} from '../HelpUnavailableOnPhone';

const MARKER = `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}`;
const PHONE = { [EMBEDDED_PAGE_PARAM]: EMBEDDED_PAGE_PARAM_VALUE };

function documents(view: 'web' | 'phone') {
  const corpus = getSupportCorpus(view);
  if (!corpus.available) throw new Error(corpus.reason);
  const byId = new Map<string, { title: string; category: string }>();
  for (const chunk of corpus.chunks) {
    if (chunk.origin === 'markdown') {
      byId.set(chunk.docId, { title: chunk.docTitle, category: chunk.category });
    }
  }
  return byId;
}

function at(pathname: string, fromPhone: boolean) {
  route.pathname = pathname;
  route.search = fromPhone ? MARKER : '';
}

async function renderArticle(slug: string, fromPhone: boolean) {
  at(`/help/${slug}`, fromPhone);
  const page = await HelpArticlePage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(fromPhone ? PHONE : {}),
  });
  return renderInShell(page);
}

function renderInShell(page: ReactElement) {
  return render(
    <EmbeddedPageProvider>
      <HelpLayout>{page}</HelpLayout>
    </EmbeddedPageProvider>,
  );
}

function siteLinks(container: HTMLElement): URL[] {
  return Array.from(container.querySelectorAll('a[href]'))
    .map((anchor) => anchor.getAttribute('href') ?? '')
    .filter((href) => !href.startsWith('#'))
    .map((href) => new URL(href, 'https://agiworkforce.com'))
    .filter((url) => url.hostname === 'agiworkforce.com');
}

function unmarkedLinks(container: HTMLElement): string[] {
  return siteLinks(container)
    .filter(
      (url) =>
        !(isEmbeddablePagePath(url.pathname) || isEmbeddableAccountPagePath(url.pathname)) ||
        url.searchParams.get(EMBEDDED_PAGE_PARAM) !== EMBEDDED_PAGE_PARAM_VALUE,
    )
    .map((url) => `${url.pathname}${url.search}`);
}

function purchaseArticle(): string {
  const phone = documents('phone');
  const purchase = [...documents('web')].find(
    ([docId, document]) => document.category === PURCHASE_HELP_CATEGORY && !phone.has(docId),
  );
  expect(purchase).toBeDefined();
  return purchase?.[0] ?? '';
}

class InertObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', InertObserver);
  vi.stubGlobal('ResizeObserver', InertObserver);
});

afterEach(() => {
  route.pathname = '/';
  route.search = '';
  vi.unstubAllGlobals();
});

describe('help opened from the phone app', () => {
  it('renders every article the phone lists with no purchase wording and every link still marked', async () => {
    const listed = [...documents('phone').keys()];
    expect(listed.length).toBeGreaterThan(30);

    const leaks: string[] = [];
    for (const slug of listed) {
      const { container, unmount } = await renderArticle(slug, true);
      const found = findPurchaseVocabulary(container.textContent ?? '');
      if (found !== null) leaks.push(`${slug}: ${found}`);
      for (const link of unmarkedLinks(container)) leaks.push(`${slug}: unmarked ${link}`);
      unmount();
    }
    expect(leaks).toEqual([]);
  });

  it('shows the not available state for a purchase article instead of the article', async () => {
    const slug = purchaseArticle();
    const title = documents('web').get(slug)?.title ?? '';

    const fromPhone = await renderArticle(slug, true);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      HELP_UNAVAILABLE_ON_PHONE_TITLE,
    );
    expect(fromPhone.container.textContent).not.toContain(title);
    expect(fromPhone.container.textContent).toContain(CONTACT_EMAIL);
    expect(findPurchaseVocabulary(fromPhone.container.textContent ?? '')).toBeNull();
    const back = screen.getByRole('link', { name: HELP_UNAVAILABLE_ON_PHONE_LINK });
    expect(back.getAttribute('href')).toBe(`/help?${MARKER}`);
    fromPhone.unmount();

    await renderArticle(slug, false);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(title);
  });

  it('keeps a marked purchase passage on the web and leaves it out from the phone', async () => {
    const web = await renderArticle('signing-up', false);
    expect(web.container.textContent).toContain('the upgrade waitlist');
    expect(web.container.textContent).toContain('no invite code to redeem');
    web.unmount();

    const phone = await renderArticle('signing-up', true);
    expect(phone.container.textContent).not.toContain('upgrade waitlist');
    expect(phone.container.textContent).toContain('no invite code to redeem');
  });

  it('shows the not available state for the purchase collection', async () => {
    at(`/help/collections/${PURCHASE_HELP_CATEGORY}`, true);
    const page = await HelpCollectionPage({
      params: Promise.resolve({ id: PURCHASE_HELP_CATEGORY }),
      searchParams: Promise.resolve(PHONE),
    });
    const { container } = renderInShell(page);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      HELP_UNAVAILABLE_ON_PHONE_TITLE,
    );
    expect(findPurchaseVocabulary(container.textContent ?? '')).toBeNull();
    expect(unmarkedLinks(container)).toEqual([]);
  });

  it('lists only the articles the phone lists in a collection opened from the phone', async () => {
    const phone = documents('phone');
    const unlisted = [...documents('web')].find(
      ([id, entry]) => !phone.has(id) && entry.category !== PURCHASE_HELP_CATEGORY,
    );
    expect(unlisted).toBeDefined();
    const document = unlisted?.[1] ?? { title: '', category: '' };
    const category = document.category;
    const shown = [...phone.values()].filter((entry) => entry.category === category);
    expect(shown.length).toBeGreaterThan(0);
    at(`/help/collections/${category}`, true);
    const page = await HelpCollectionPage({
      params: Promise.resolve({ id: category }),
      searchParams: Promise.resolve(PHONE),
    });
    const { container } = renderInShell(page);

    expect(container.textContent).not.toContain(document.title);
    for (const entry of shown) expect(container.textContent).toContain(entry.title);
    expect(unmarkedLinks(container)).toEqual([]);
  });

  it('keeps the phone marker when a help topic sends the reader to an article', async () => {
    const redirect = await HelpPage({
      searchParams: Promise.resolve({ topic: 'tool-approvals', ...PHONE }),
    }).catch((error: unknown) => error);

    expect(String((redirect as { digest?: string }).digest)).toContain(
      `/help/tool-approvals?${MARKER}`,
    );
  });

  describe('the search box', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', (input: string) =>
        GET(new Request(new URL(input, 'https://agiworkforce.com')) as never),
      );
    });

    it.each(['upgrade', 'pricing', 'refund', 'invoice', 'checkout'])(
      'shows the empty state with the support address for %s',
      async (query) => {
        at('/help', true);
        render(
          <EmbeddedPageProvider>
            <HelpSearch initialQuery={query} />
          </EmbeddedPageProvider>,
        );

        const empty = await screen.findByText(/Nothing here covers that yet/u);
        expect(empty.textContent).toContain(CONTACT_EMAIL);
      },
    );
  });
});
