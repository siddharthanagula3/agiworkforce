import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMBEDDED_PAGE_PARAM, EMBEDDED_PAGE_PARAM_VALUE } from '@agiworkforce/types';

type NavigationModule = typeof import('next/navigation');

const route = vi.hoisted(() => ({ pathname: '/release-notes', search: '' }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<NavigationModule>()),
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import { EmbeddedPageProvider } from '@shared/components/layout/EmbeddedPage';
import { RELEASES, releaseSlug } from '@/lib/changelog-entries';
import ReleaseAnnouncementPage from '../[slug]/page';

const BILLING_RELEASE = RELEASES.find((release) => release.billing);
const OTHER_RELEASE = RELEASES.find((release) => !release.billing);

async function renderAnnouncement(
  release: (typeof RELEASES)[number] | undefined,
  embedded: boolean,
) {
  if (!release) throw new Error('No release to render');
  route.pathname = `/release-notes/${releaseSlug(release)}`;
  route.search = embedded ? `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}` : '';
  const page = await ReleaseAnnouncementPage({
    params: Promise.resolve({ slug: releaseSlug(release) }),
  });
  return render(<EmbeddedPageProvider>{page}</EmbeddedPageProvider>);
}

describe('/release-notes/[slug] billing entries', () => {
  beforeEach(() => {
    route.search = '';
  });

  it('does not show a billing entry in the page the phone opens', async () => {
    await renderAnnouncement(BILLING_RELEASE, true);

    expect(document.body.textContent).not.toContain(BILLING_RELEASE?.headline ?? '');
    for (const line of BILLING_RELEASE?.body ?? []) {
      expect(document.body.textContent).not.toContain(line);
    }
    expect(document.body.textContent).toContain('This release note is not shown in the app.');
  });

  it('shows a billing entry in full when the page is not opened from the phone', async () => {
    await renderAnnouncement(BILLING_RELEASE, false);

    expect(document.body.textContent).toContain(BILLING_RELEASE?.headline ?? '');
    expect(document.body.textContent).not.toContain('is not shown in the app');
  });

  it('shows every other entry in full in the page the phone opens', async () => {
    await renderAnnouncement(OTHER_RELEASE, true);

    expect(document.body.textContent).toContain(OTHER_RELEASE?.headline ?? '');
    expect(document.body.textContent).not.toContain('is not shown in the app');
  });
});
