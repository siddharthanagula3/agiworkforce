import { render, screen, within } from '@testing-library/react';
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
import { RELEASES } from '@/lib/changelog-entries';
import { ReleaseNotesPage } from '../ReleaseNotesPage';
import { RELEASE_NOTES, releasedNoteCount } from '../release-notes-data';
import { DOC_MATURITIES } from '@/lib/support/doc-metadata';

const BILLING_RELEASES = RELEASES.filter((release) => release.billing);
const OTHER_RELEASES = RELEASES.filter((release) => !release.billing);

function renderAt(embedded: boolean) {
  route.search = embedded ? `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}` : '';
  return render(
    <EmbeddedPageProvider>
      <ReleaseNotesPage titleId="release-notes-title" />
    </EmbeddedPageProvider>,
  );
}

function releaseHeadlines(): string[] {
  return within(screen.getByRole('list', { name: 'Releases' }))
    .getAllByRole('listitem')
    .map((row) => row.querySelector('strong')?.textContent ?? '');
}

describe('/release-notes billing entries', () => {
  beforeEach(() => {
    route.pathname = '/release-notes';
  });

  it('marks the entries about billing and plans for sale', () => {
    expect(BILLING_RELEASES.map((release) => release.date)).toEqual(['2026-09-27']);
  });

  it('leaves them out of the page the phone opens and keeps every other entry in order', () => {
    renderAt(true);

    expect(releaseHeadlines()).toEqual(OTHER_RELEASES.map((release) => release.headline));
    for (const release of BILLING_RELEASES) {
      expect(document.body.textContent).not.toContain(release.headline);
      for (const line of release.body) expect(document.body.textContent).not.toContain(line);
    }
  });

  it('counts only the entries it shows in the page the phone opens', () => {
    renderAt(true);

    expect(document.body.textContent).toContain(`Dated releases: ${OTHER_RELEASES.length}`);
    expect(document.body.textContent).toContain(`Newest: ${OTHER_RELEASES[0]?.date}`);
  });

  it('counts the maturity of only the entries it shows in the page the phone opens', () => {
    renderAt(true);
    const shown = RELEASE_NOTES.filter((note) => !note.billing);
    const labels = { ga: 'Generally available', beta: 'In beta', alpha: 'In alpha' } as const;

    for (const maturity of DOC_MATURITIES) {
      const count = releasedNoteCount(maturity, shown);
      const fact = `${labels[maturity]}: ${count}`;
      if (count > 0) expect(document.body.textContent).toContain(fact);
      else expect(document.body.textContent).not.toContain(`${labels[maturity]}:`);
    }
  });

  it('leaves the page unchanged when it is not opened from the phone', () => {
    renderAt(false);

    expect(releaseHeadlines()).toEqual(RELEASES.map((release) => release.headline));
    expect(document.body.textContent).toContain(`Dated releases: ${RELEASE_NOTES.length}`);
    expect(screen.getByText(BILLING_RELEASES[0]?.headline ?? '')).toBeTruthy();
  });
});
