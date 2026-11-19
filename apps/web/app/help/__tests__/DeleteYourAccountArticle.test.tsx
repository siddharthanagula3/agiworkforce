import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDABLE_ACCOUNT_PAGE_PATHS,
  EMBEDDED_PAGE_PARAM,
  EMBEDDED_PAGE_PARAM_VALUE,
} from '@agiworkforce/types';

type NavigationModule = typeof import('next/navigation');

const route = vi.hoisted(() => ({ pathname: '/', search: '' }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<NavigationModule>()),
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));
vi.mock('@/features/docs/components/DocsShell', () => ({
  DocsShell: ({ children }: { children: ReactNode }) => children,
}));

import { CANONICAL_POLICY_ROUTES, CONTACT_EMAIL, CONTACT_SUBJECTS } from '@/lib/legal-constants';
import { EmbeddedPageProvider } from '@shared/components/layout/EmbeddedPage';

import HelpLayout from '../layout';
import HelpArticlePage from '../[slug]/page';

const SLUG = 'delete-your-account';
const ACCOUNT_PAGE = EMBEDDABLE_ACCOUNT_PAGE_PATHS[0];
const MARKER = `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}`;
const PLAY_LISTING = JSON.parse(
  readFileSync(
    join(process.cwd(), '..', 'mobile', 'store-listing', 'LISTING-METADATA-ANDROID.json'),
    'utf8',
  ),
) as { app_name: string };

async function renderArticle(embedded: boolean) {
  route.pathname = `/help/${SLUG}`;
  route.search = embedded ? MARKER : '';
  return render(
    <EmbeddedPageProvider>
      <HelpLayout>{await HelpArticlePage({ params: Promise.resolve({ slug: SLUG }) })}</HelpLayout>
    </EmbeddedPageProvider>,
  );
}

function hrefs(container: HTMLElement): URL[] {
  return Array.from(container.querySelectorAll('a[href]')).map(
    (anchor) => new URL(anchor.getAttribute('href') ?? '', 'https://agiworkforce.com'),
  );
}

afterEach(() => {
  route.pathname = '/';
  route.search = '';
});

describe('the account deletion page given to Google Play', () => {
  it('names the app as the store listing does', async () => {
    const { container } = await renderArticle(false);

    expect(container.textContent).toContain(PLAY_LISTING.app_name);
  });

  it('links to the web account page where a signed-in person deletes the account', async () => {
    const { container } = await renderArticle(false);

    expect(hrefs(container).some((url) => url.pathname === ACCOUNT_PAGE)).toBe(true);
  });

  it('offers the privacy request email and form for someone who cannot sign in', async () => {
    const { container } = await renderArticle(false);
    const links = hrefs(container);
    const mailto = links.find((url) => url.protocol === 'mailto:');

    expect(mailto?.pathname).toBe(CONTACT_EMAIL);
    expect(mailto?.searchParams.get('subject')).toBe(CONTACT_SUBJECTS.privacy);
    expect(links.some((url) => url.pathname === CANONICAL_POLICY_ROUTES.dataRights)).toBe(true);
  });

  it('sends someone who signed up with Apple in the app to the request form', async () => {
    const { container } = await renderArticle(false);
    const paragraph = Array.from(container.querySelectorAll('p')).find((element) =>
      element.textContent
        ?.replace(/\s+/g, ' ')
        .includes('Sign in with Apple and the sign-in page here'),
    );

    expect(paragraph).toBeDefined();
    expect(
      hrefs(paragraph as HTMLElement).some(
        (url) => url.pathname === CANONICAL_POLICY_ROUTES.dataRights,
      ),
    ).toBe(true);
  });

  it('quotes the privacy policy on how long organisation audit log entries are kept', async () => {
    const { container } = await renderArticle(false);
    const policy = readFileSync(join(process.cwd(), 'app', 'privacy', 'page.tsx'), 'utf8');
    const quoted = [
      'Erasure does not purge them.',
      'a separate privileged routine exists to purge them, and it is not part of the automatic path.',
    ];

    for (const sentence of quoted) {
      expect(policy).toContain(sentence);
      expect(container.textContent?.replace(/\s+/g, ' ')).toContain(sentence);
    }
  });

  it('points to the retention schedule in the privacy policy', async () => {
    const { container } = await renderArticle(false);

    expect(
      hrefs(container).some(
        (url) => url.pathname === CANONICAL_POLICY_ROUTES.privacy && url.hash === '#s-05',
      ),
    ).toBe(true);
  });

  it('keeps the account link and the request contact when opened from the phone app', async () => {
    const { container } = await renderArticle(true);
    const links = hrefs(container);

    expect(
      links.some(
        (url) =>
          url.pathname === ACCOUNT_PAGE &&
          url.searchParams.get(EMBEDDED_PAGE_PARAM) === EMBEDDED_PAGE_PARAM_VALUE,
      ),
    ).toBe(true);
    expect(links.some((url) => url.protocol === 'mailto:')).toBe(true);
  });
});
