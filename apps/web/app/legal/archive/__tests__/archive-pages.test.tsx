import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import { PolicyVersionsLink } from '@shared/components/legal/PolicyVersionsLink';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  policyHistories,
  policyHistoryForKey,
  policyHistoryHref,
  versionStanding,
  type PolicyHistory,
  type PolicyVersionEntry,
} from '@/lib/legal/policy-archive';

import PolicyHistoryPage, { generateStaticParams as historyParams } from '../[policy]/page';
import ArchivedPolicyPage, {
  generateMetadata as versionMetadata,
  generateStaticParams as versionParams,
} from '../[policy]/[date]/page';

const CLAIMS_IT_APPLIED = /\bappl(?:y|ies|ied)\b|last published/i;

function replacedVersions(published: boolean) {
  return policyHistories().flatMap((history) =>
    history.versions
      .filter((version) => version.status !== 'current' && version.published === published)
      .map((version) => ({ history, version })),
  );
}

async function historyRowStanding(history: PolicyHistory, version: PolicyVersionEntry) {
  const { unmount } = render(
    await PolicyHistoryPage({ params: Promise.resolve({ policy: history.slug }) }),
  );
  const row = within(screen.getByRole('list', { name: 'Versions' }))
    .getAllByRole('listitem')
    .find((item) => item.firstElementChild?.textContent === version.date);
  const text = (row?.textContent ?? '').replace(version.summary ?? '', '');
  unmount();
  return text;
}

async function versionPageStanding(history: PolicyHistory, version: PolicyVersionEntry) {
  const params = Promise.resolve({ policy: history.slug, date: version.date });
  const metadata = await versionMetadata({ params });
  const { unmount } = render(await ArchivedPolicyPage({ params }));
  const standing = versionStanding(history, version.date) ?? '';
  const lede = screen.getByText(standing).closest('p')?.textContent ?? '';
  unmount();
  return { lede, description: String(metadata.description ?? '') };
}

describe('/legal/archive', () => {
  it('lists every dated version of the terms with what changed', async () => {
    render(await PolicyHistoryPage({ params: Promise.resolve({ policy: 'terms' }) }));

    expect(screen.getByRole('heading', { level: 1, name: 'Version history.' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Current version' })).toHaveAttribute('href', '/terms');
    expect(
      screen
        .getAllByRole('link', { name: 'Read this version' })
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/legal/archive/terms/2026-09-23', '/legal/archive/terms/2026-08-11']);
    expect(document.body.textContent).toContain('The full text of this version was not kept.');
  });

  it('shows an earlier version in full and says until when it applied', async () => {
    render(
      await ArchivedPolicyPage({
        params: Promise.resolve({ policy: 'terms', date: '2026-08-11' }),
      }),
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of service.' })).toBeVisible();
    expect(document.body.textContent).toContain(
      'This version applied until the version dated 2026-09-23 replaced it on this site.',
    );
    expect(document.body.textContent).toContain('Last updated: 2026-08-11.');
    expect(screen.getByRole('heading', { name: '02 · Eligibility and age' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Read the current version' })).toHaveAttribute(
      'href',
      '/terms',
    );
  });

  it('says a version this site never published was replaced before it was published, names the first version published after it, and never says it applied', async () => {
    const unpublished = replacedVersions(false);
    expect(unpublished.map(({ history, version }) => `${history.key} ${version.date}`)).toEqual(
      expect.arrayContaining([
        'privacy 2026-09-21',
        'subprocessors 2026-09-22',
        'terms 2026-09-22',
      ]),
    );

    for (const { history, version } of unpublished) {
      const where = `${history.key} ${version.date}`;
      const position = history.versions.indexOf(version);
      const replacedOn = history.versions[position - 1]?.date;
      const firstPublishedAfter = history.versions
        .slice(0, position)
        .reverse()
        .find((entry) => entry.published !== false)?.date;
      const standing = `This version was settled on ${version.date} and replaced on ${replacedOn} before it was published on this site; the first version published here after it is dated ${firstPublishedAfter}.`;
      expect(versionStanding(history, version.date), where).toBe(standing);

      const row = await historyRowStanding(history, version);
      expect(row, where).toContain(standing);
      expect(row, where).not.toMatch(CLAIMS_IT_APPLIED);

      if (version.status !== 'archived') continue;
      const { lede, description } = await versionPageStanding(history, version);
      for (const [surface, text] of [
        ['lede', lede],
        ['description', description],
      ] as const) {
        expect(text, `${where} ${surface}`).toContain(standing);
        expect(text, `${where} ${surface}`).not.toMatch(CLAIMS_IT_APPLIED);
      }
    }
  });

  it('says a version this site published applied until the next one it published replaced it', async () => {
    const published = replacedVersions(true);
    expect(published.map(({ history, version }) => `${history.key} ${version.date}`)).toEqual(
      expect.arrayContaining([
        'privacy 2026-09-12',
        'subprocessors 2026-09-12',
        'mobile 2026-08-13',
      ]),
    );

    for (const { history, version } of published) {
      const where = `${history.key} ${version.date}`;
      const successor = history.versions
        .slice(0, history.versions.indexOf(version))
        .reverse()
        .find((entry) => entry.published !== false);
      const standing = `This version applied until the version dated ${successor?.date} replaced it on this site.`;
      expect(versionStanding(history, version.date), where).toBe(standing);
      expect(await historyRowStanding(history, version), where).toContain(standing);

      const { lede, description } = await versionPageStanding(history, version);
      expect(lede, where).toContain(standing);
      expect(description, where).toContain(standing);
    }
  });

  it('prerenders one page per history and per archived version', () => {
    expect(historyParams()).toContainEqual({ policy: 'acceptable-use' });
    expect(historyParams()).toContainEqual({ policy: 'trust' });
    expect(versionParams()).toContainEqual({ policy: 'privacy', date: '2026-09-21' });
    expect(versionParams()).toContainEqual({ policy: 'privacy', date: '2026-09-12' });
    expect(versionParams()).not.toContainEqual({ policy: 'terms', date: '2026-09-22' });
  });

  it('lists a policy introduced after version histories began and offers previous versions only where a history holds more than one', async () => {
    render(await PolicyHistoryPage({ params: Promise.resolve({ policy: 'referral-terms' }) }));
    expect(screen.getByRole('link', { name: 'Current version' })).toHaveAttribute(
      'href',
      '/referral-terms',
    );

    for (const policy of Object.keys(POLICY_LAST_UPDATED) as (keyof typeof POLICY_LAST_UPDATED)[]) {
      const history = policyHistoryForKey(policy);
      const { container, unmount } = render(<PolicyVersionsLink policy={policy} />);
      if (history && history.versions.length > 1) {
        expect(within(container).getByRole('link', { name: 'Previous versions' })).toHaveAttribute(
          'href',
          policyHistoryHref(history),
        );
      } else {
        expect(container, policy).toBeEmptyDOMElement();
      }
      unmount();
    }
    expect(policyHistoryForKey('referralTerms')?.versions.map((version) => version.date)).toEqual([
      '2026-10-08',
      '2026-09-27',
    ]);
  });
});
