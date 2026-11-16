import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDED_PAGE_PARAM,
  EMBEDDED_PAGE_PARAM_VALUE,
  isEmbeddablePagePath,
} from '@agiworkforce/types';

type HealthCheckModule = typeof import('@/lib/server/health-check');
type AttainmentModule = typeof import('@/lib/server/slo/attainment');
type ServiceNoticesModule = typeof import('@/lib/server/service-notices');

type NavigationModule = typeof import('next/navigation');
type HeadersModule = typeof import('next/headers');

const route = vi.hoisted(() => ({ pathname: '/', search: '' }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<NavigationModule>()),
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));
vi.mock('next/headers', async (importOriginal) => ({
  ...(await importOriginal<HeadersModule>()),
  headers: async () => new Headers(),
}));
vi.mock('@/lib/server/health-check', async (importOriginal) => ({
  ...(await importOriginal<HealthCheckModule>()),
  getCachedHealthChecks: async () => null,
}));
vi.mock('@/lib/server/slo/attainment', async (importOriginal) => ({
  ...(await importOriginal<AttainmentModule>()),
  getCachedSloAttainment: async () => null,
}));
vi.mock('@/lib/server/service-notices', async (importOriginal) => ({
  ...(await importOriginal<ServiceNoticesModule>()),
  readIncidentRecoveries: async () => [],
}));

import AcceptableUsePage from '@/app/acceptable-use/page';
import CookiesPage from '@/app/cookies/page';
import DataUsePage from '@/app/data-use/page';
import HelpLayout from '@/app/help/layout';
import HelpPage from '@/app/help/page';
import IndiaDpdpNoticePage from '@/app/privacy/india/page';
import DataRightsPage from '@/app/privacy/requests/page';
import ReleaseNotesIndexPage from '@/app/release-notes/page';
import SecurityPage from '@/app/security/page';
import StatusPage from '@/app/status/page';
import SubprocessorsPage from '@/app/subprocessors/page';
import SupportPage from '@/app/support/page';
import TrustPage from '@/app/trust/page';
import { EmbeddedPageProvider } from '../EmbeddedPage';

const MARKER = `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}`;
const SALES_PATHS = ['/', '/pricing', '/contact-sales', '/login', '/signup', '/chat'];
const PURCHASE_PREFIXES = ['/upgrade', '/checkout', '/billing', '/settings/billing', '/plans'];
const SALES_LINK_NAME = /pricing|contact sales|talk to sales|upgrade|checkout|sign up/i;

type PageCase = readonly [path: string, page: () => ReactElement | Promise<ReactElement>];

const PHONE_OPENED_PAGES: readonly PageCase[] = [
  ['/acceptable-use', () => <AcceptableUsePage />],
  ['/cookies', () => <CookiesPage />],
  ['/data-use', () => <DataUsePage />],
  [
    '/help',
    async () => (
      <HelpLayout>
        {await HelpPage({ searchParams: Promise.resolve({ q: 'permissions' }) })}
      </HelpLayout>
    ),
  ],
  ['/privacy/india', () => <IndiaDpdpNoticePage />],
  ['/privacy/requests', () => DataRightsPage()],
  ['/release-notes', () => <ReleaseNotesIndexPage />],
  ['/security', () => <SecurityPage />],
  ['/status', () => StatusPage()],
  ['/subprocessors', () => <SubprocessorsPage />],
  ['/support', () => <SupportPage />],
  ['/trust', () => <TrustPage />],
];

function at(pathname: string, embedded: boolean) {
  route.pathname = pathname;
  route.search = embedded ? MARKER : '';
}

async function renderPage(page: PageCase[1]) {
  return render(<EmbeddedPageProvider>{await page()}</EmbeddedPageProvider>);
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({}), { status: 401 })),
  );
});

afterEach(() => {
  at('/', false);
  vi.unstubAllGlobals();
});

describe('every other public page the phone app opens in its in-app browser', () => {
  it.each(PHONE_OPENED_PAGES)(
    '%s with the marker shows its content and no route to pricing, plans or sales',
    async (path, page) => {
      at(path, true);
      const { container } = await renderPage(page);

      expect(container.querySelector('h1')).not.toBeNull();
      expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
      expect(screen.queryByRole('navigation', { name: 'Footer' })).toBeNull();
      expect(screen.queryByRole('link', { name: SALES_LINK_NAME })).toBeNull();
      expect(salesLinks(container)).toEqual([]);
      expect(unmarkedOrForeignLinks(container)).toEqual([]);
    },
  );

  it.each(PHONE_OPENED_PAGES)(
    '%s without the marker keeps the site header, footer and pricing link',
    async (path, page) => {
      at(path, false);
      const { container } = await renderPage(page);

      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument();
      expect(salesLinks(container)).toContain('/pricing');
      expect(container.innerHTML).not.toContain(MARKER);
    },
  );
});
