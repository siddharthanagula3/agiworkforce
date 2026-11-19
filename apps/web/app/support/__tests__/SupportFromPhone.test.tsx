import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  EMBEDDED_PAGE_PARAM,
  EMBEDDED_PAGE_PARAM_VALUE,
  isEmbeddablePagePath,
} from '@agiworkforce/types';

type NavigationModule = typeof import('next/navigation');

const route = vi.hoisted(() => ({ pathname: '/support', search: '' }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<NavigationModule>()),
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));

import { SUPPORT_ROWS } from '@/features/marketing/components/pages/company/support-content';
import { CONTACT_EMAIL } from '@/lib/legal-constants';
import { EmbeddedPageProvider } from '@shared/components/layout/EmbeddedPage';
import { findPurchaseVocabulary } from '../../../scripts/lib/support-purchase-passages.mjs';
import SupportPage, { generateMetadata } from '../page';

const MARKER = `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}`;
const PHONE = { [EMBEDDED_PAGE_PARAM]: EMBEDDED_PAGE_PARAM_VALUE };
const PLAN_LABELS = Object.values(BILLING_PLAN_PRICING).map((plan) => plan.label);

async function renderSupport(fromPhone: boolean) {
  route.search = fromPhone ? MARKER : '';
  const page = await SupportPage({ searchParams: Promise.resolve(fromPhone ? PHONE : {}) });
  return render(<EmbeddedPageProvider>{page}</EmbeddedPageProvider>);
}

function siteLinks(container: HTMLElement): URL[] {
  return Array.from(container.querySelectorAll('a[href]'))
    .map((anchor) => anchor.getAttribute('href') ?? '')
    .filter((href) => !href.startsWith('#'))
    .map((href) => new URL(href, 'https://agiworkforce.com'))
    .filter((url) => url.protocol === 'https:' && url.hostname === 'agiworkforce.com');
}

function namedPlans(text: string): string[] {
  const words = ` ${text.replace(/[^\p{L}\p{N}+]+/gu, ' ')} `;
  return PLAN_LABELS.filter((label) => words.includes(` ${label} `));
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
  route.search = '';
  vi.unstubAllGlobals();
});

describe('the support page opened from the phone app', () => {
  it('says only how to reach support, with no plan, tier or service-level content', async () => {
    const { container } = await renderSupport(true);
    const text = container.textContent ?? '';

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('How to reach support.');
    expect(text).toContain(CONTACT_EMAIL);
    expect(text).toContain('Central Time');
    expect(findPurchaseVocabulary(text)).toBeNull();
    expect(namedPlans(text)).toEqual([]);
    expect(text).not.toMatch(/\btiers?\b/iu);
    expect(text).not.toContain('/sla');
    expect(text).not.toContain('response-time');
    expect(screen.queryByRole('list', { name: 'Support by tier' })).toBeNull();
    for (const row of SUPPORT_ROWS) expect(text).not.toContain(row.value);
  });

  it('describes the page in its metadata without comparing plans', async () => {
    const phone = await generateMetadata({ searchParams: Promise.resolve(PHONE) });
    const web = await generateMetadata({ searchParams: Promise.resolve({}) });
    const phoneText = [
      phone.title,
      phone.description,
      phone.openGraph?.description,
      phone.twitter?.description,
    ].join(' ');

    expect(phone.description).toBe('How to reach us today and where to report bugs.');
    expect(findPurchaseVocabulary(phoneText)).toBeNull();
    expect(namedPlans(phoneText)).toEqual([]);
    expect(phoneText).not.toContain('response-time');
    expect(web.description).toContain('the support commitment for every plan');
    expect(web.description).toContain('Enterprise contact');
  });

  it('keeps the phone marker on every site link it shows', async () => {
    const { container } = await renderSupport(true);
    const links = siteLinks(container);

    expect(links.map((url) => url.pathname)).toEqual(expect.arrayContaining(['/help', '/status']));
    const unmarked = links
      .filter(
        (url) =>
          !isEmbeddablePagePath(url.pathname) ||
          url.searchParams.get(EMBEDDED_PAGE_PARAM) !== EMBEDDED_PAGE_PARAM_VALUE,
      )
      .map((url) => `${url.pathname}${url.search}`);
    expect(unmarked).toEqual([]);
    expect(screen.getByRole('link', { name: `Email ${CONTACT_EMAIL}` })).toBeInTheDocument();
  });

  it('keeps the plan commitments and the tier table for every other visitor', async () => {
    const { container } = await renderSupport(false);
    const text = container.textContent ?? '';

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Support channels and plan commitments.',
    );
    expect(screen.getByRole('heading', { name: 'What you can count on, by tier.' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Support by tier' })).toBeInTheDocument();
    for (const row of SUPPORT_ROWS) expect(text).toContain(row.value);
    expect(screen.getByRole('link', { name: '/sla' }).getAttribute('href')).toBe('/sla');
    expect(text).toContain(`${BILLING_PLAN_PRICING.team.label} and`);
    expect(text).toContain('a ticket raised from Settings, Help');
    expect(container.innerHTML).not.toContain(MARKER);
  });
});
