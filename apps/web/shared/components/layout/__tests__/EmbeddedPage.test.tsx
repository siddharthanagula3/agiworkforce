import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDED_PAGE_PARAM,
  EMBEDDED_PAGE_PARAM_VALUE,
  isEmbeddablePagePath,
} from '@agiworkforce/types';

type NavigationModule = typeof import('next/navigation');

const route = vi.hoisted(() => ({ pathname: '/', search: '' }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<NavigationModule>()),
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));

import HelpLayout from '@/app/help/layout';
import HelpArticlePage from '@/app/help/[slug]/page';
import PrivacyPage from '@/app/privacy/page';
import TermsPage from '@/app/terms/page';
import { embeddedPageHref } from '@/lib/embedded-page';
import { purchaseHelpPaths } from '@/lib/support/help-articles';
import { EmbeddedPageProvider } from '../EmbeddedPage';

const MARKER = `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}`;
const SALES_PATHS = ['/', '/pricing', '/contact-sales', '/login', '/signup', '/chat'];
const PURCHASE_PREFIXES = ['/upgrade', '/checkout', '/billing', '/settings/billing'];
const ARTICLE_WITH_SALES_LINKS = 'getting-started';

function at(pathname: string, embedded: boolean) {
  route.pathname = pathname;
  route.search = embedded ? MARKER : '';
}

function renderPage(page: ReactElement) {
  return render(<EmbeddedPageProvider>{page}</EmbeddedPageProvider>);
}

async function helpArticle(slug: string) {
  return <HelpLayout>{await HelpArticlePage({ params: Promise.resolve({ slug }) })}</HelpLayout>;
}

function siteLinks(container: HTMLElement): URL[] {
  return Array.from(container.querySelectorAll('a[href]'))
    .map((anchor) => anchor.getAttribute('href') ?? '')
    .filter((href) => !href.startsWith('#'))
    .map((href) => new URL(href, 'https://agiworkforce.com'))
    .filter((url) => url.protocol === 'https:' || url.protocol === 'http:')
    .filter((url) => url.hostname === 'agiworkforce.com' || url.hostname.endsWith('.test'));
}

function salesLinks(container: HTMLElement): string[] {
  return siteLinks(container)
    .filter(
      (url) =>
        SALES_PATHS.includes(url.pathname) ||
        PURCHASE_PREFIXES.some(
          (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
        ),
    )
    .map((url) => url.pathname);
}

function unmarkedOrForeignLinks(container: HTMLElement): string[] {
  return siteLinks(container)
    .filter(
      (url) =>
        !isEmbeddablePagePath(url.pathname) ||
        url.searchParams.get(EMBEDDED_PAGE_PARAM) !== EMBEDDED_PAGE_PARAM_VALUE,
    )
    .map((url) => `${url.pathname}${url.search}`);
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
  at('/', false);
  vi.unstubAllGlobals();
});

describe('a public content page opened from the phone app', () => {
  it.each([
    ['/terms', () => <TermsPage />],
    ['/privacy', () => <PrivacyPage />],
  ])('%s renders the policy with no site navigation and no route to a sale', (path, page) => {
    at(path, true);
    const { container } = renderPage(page());

    expect(container.querySelector('h1')).not.toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Footer' })).toBeNull();
    expect(
      screen.queryByRole('link', { name: /pricing|contact sales|sign in|try chat/i }),
    ).toBeNull();
    expect(salesLinks(container)).toEqual([]);
    expect(unmarkedOrForeignLinks(container)).toEqual([]);
    expect(siteLinks(container).length).toBeGreaterThan(0);
  });

  it('keeps the terms text that names the pricing page, as text rather than a link', () => {
    at('/terms', true);
    const { container } = renderPage(<TermsPage />);

    expect(container.textContent).toContain('/pricing');
    expect(container.querySelector('a[href^="/pricing"]')).toBeNull();
    expect(container.querySelector(`a[href="/acceptable-use?${MARKER}"]`)).not.toBeNull();
  });

  it('renders a help article with its contents and no docs sidebar, header, footer or sales link', async () => {
    at(`/help/${ARTICLE_WITH_SALES_LINKS}`, true);
    const { container } = renderPage(await helpArticle(ARTICLE_WITH_SALES_LINKS));

    expect(container.querySelector('.dx-shell')?.getAttribute('data-embedded')).toBe('true');
    expect(container.querySelector('.dx-side')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Browse documentation' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Footer' })).toBeNull();
    expect(container.textContent).toContain('Open Sign up, create an account');
    expect(screen.queryByRole('link', { name: 'Sign up' })).toBeNull();
    expect(salesLinks(container)).toEqual([]);
    expect(unmarkedOrForeignLinks(container)).toEqual([]);
  });

  it('links no help article about buying a plan, though an ordinary visitor sees those links', async () => {
    const purchasePaths = purchaseHelpPaths();
    const articleSlug = purchasePaths
      .find((path) => path.startsWith('/help/') && !path.startsWith('/help/collections/'))
      ?.slice('/help/'.length);
    expect(articleSlug).toBeDefined();
    const slug = articleSlug ?? '';
    const purchaseLinks = (container: HTMLElement) =>
      siteLinks(container)
        .map((url) => url.pathname)
        .filter((path) => purchasePaths.includes(path));

    at(`/help/${slug}`, false);
    const ordinary = renderPage(await helpArticle(slug));
    expect(purchaseLinks(ordinary.container).length).toBeGreaterThan(0);
    ordinary.unmount();

    at(`/help/${slug}`, true);
    const embedded = renderPage(await helpArticle(slug));
    expect(purchaseLinks(embedded.container)).toEqual([]);
    expect(unmarkedOrForeignLinks(embedded.container)).toEqual([]);
  });
});

describe('the same pages for an ordinary visitor', () => {
  it.each([
    ['/terms', () => <TermsPage />],
    ['/privacy', () => <PrivacyPage />],
  ])('%s keeps the site header, footer and their links', (path, page) => {
    at(path, false);
    const { container } = renderPage(page());

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument();
    expect(container.querySelector('a[href="/pricing"]')).not.toBeNull();
    expect(container.querySelector('a[href="/"]')).not.toBeNull();
    expect(container.innerHTML).not.toContain(MARKER);
  });

  it('keeps the help article sidebar, header and footer', async () => {
    at(`/help/${ARTICLE_WITH_SALES_LINKS}`, false);
    const { container } = renderPage(await helpArticle(ARTICLE_WITH_SALES_LINKS));

    expect(container.querySelector('.dx-shell')?.hasAttribute('data-embedded')).toBe(false);
    expect(container.querySelector('.dx-side')).not.toBeNull();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument();
    expect(container.querySelector('a[href="https://agiworkforce.com/signup"]')).not.toBeNull();
    expect(container.innerHTML).not.toContain(MARKER);
  });

  it('ignores the marker on a page that is not embeddable', () => {
    at('/pricing', true);
    const { container } = renderPage(<TermsPage />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(MARKER);
  });
});

describe('embeddedPageHref', () => {
  it.each([
    ['/terms', `/terms?${MARKER}`],
    ['/privacy/india#rights', `/privacy/india?${MARKER}#rights`],
    ['https://agiworkforce.com/help/memory', `/help/memory?${MARKER}`],
    ['/help?q=voice', `/help?q=voice&${MARKER}`],
    ['#s-01', '#s-01'],
    ['mailto:help@example.com', 'mailto:help@example.com'],
    ['https://openai.com/policies/', 'https://openai.com/policies/'],
    ['/', null],
    ['/pricing', null],
    ['/contact-sales', null],
    ['/signup', null],
    ['/settings/billing', null],
    ['https://agiworkforce.com/pricing', null],
  ])('%s becomes %s', (href, expected) => {
    expect(embeddedPageHref(href)).toBe(expected);
  });

  it('drops a path the page excludes', () => {
    expect(embeddedPageHref('/help/billing-and-plans', new Set(['/help/billing-and-plans']))).toBe(
      null,
    );
  });
});
