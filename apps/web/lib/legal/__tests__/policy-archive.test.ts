import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import manifest from '@/content/legal/policy-archive/manifest.json';
import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  POLICY_PUBLICATION_FLOOR,
  archivedPolicyText,
  firstPublishedStanding,
  olderArchivedVersion,
  policyChanges,
  policyHistories,
  policyHistoryForKey,
  versionStanding,
  type PolicyHistory,
} from '../policy-archive';

const WEB_DIR = path.join(__dirname, '..', '..', '..');

interface RegistryVersion {
  date: string | null;
  summary?: string;
}

const REGISTRY: {
  recordedSince: string;
  publications: { checkedOn: string }[];
  documents: Record<string, { versions: RegistryVersion[] }>;
} = JSON.parse(
  readFileSync(
    path.join(WEB_DIR, '..', '..', 'docs', 'compliance', 'policy-versions.json'),
    'utf8',
  ),
);

function datedRevisions(key: string): RegistryVersion[] {
  const dates = new Set<string>();
  return (REGISTRY.documents[key]?.versions ?? []).filter((version) => {
    if (!version.date || dates.has(version.date)) return false;
    dates.add(version.date);
    return true;
  });
}

function introducedAfterHistoriesBegan(revision: RegistryVersion | undefined): boolean {
  return Boolean(revision?.date && revision.date > REGISTRY.recordedSince);
}

function listedRevisions(key: string): RegistryVersion[] {
  return datedRevisions(key).filter(
    (revision, position) => position > 0 || introducedAfterHistoriesBegan(revision),
  );
}

function listedDates(key: string): string[] {
  return policyChanges()
    .filter((change) => change.history.key === key)
    .map((change) => change.date);
}

describe('policy version history', () => {
  it('names every policy with a history and dates its current version as the page does', () => {
    for (const history of policyHistories()) {
      expect(history.label).not.toBe(history.route);
      expect(history.current).toBe(
        POLICY_LAST_UPDATED[history.key as keyof typeof POLICY_LAST_UPDATED],
      );
      expect(history.versions[0]).toMatchObject({ date: history.current, status: 'current' });
    }
  });

  it('holds the text of every version it says is archived', () => {
    for (const history of policyHistories()) {
      for (const version of history.versions.filter((entry) => entry.status === 'archived')) {
        const text = archivedPolicyText(history.key, version.date);
        expect(text?.date).toBe(version.date);
        expect(text?.route).toBe(history.route);
        expect(text?.blocks.some((block) => block.type === 'heading')).toBe(true);
      }
    }
  });

  it('says what changed in every version after the first', () => {
    for (const history of policyHistories()) {
      for (const version of history.versions.slice(0, -1)) {
        expect(version.summary, `${history.key} ${version.date}`).toBeTruthy();
      }
    }
  });

  it('steps back from one archived version to the next older one', () => {
    const privacy = policyHistoryForKey('privacy');
    expect(privacy).not.toBeNull();
    if (!privacy) return;
    expect(olderArchivedVersion(privacy, '2026-09-22')).toBe('2026-09-21');
    expect(olderArchivedVersion(privacy, '2026-09-21')).toBe('2026-09-12');
    expect(olderArchivedVersion(privacy, '2026-09-12')).toBeNull();
  });

  it('starts each history at the version this site served when production was first checked', () => {
    for (const [key, served] of [
      ['privacy', '2026-09-12'],
      ['subprocessors', '2026-09-12'],
      ['mobile', '2026-08-13'],
      ['trust', '2026-09-12'],
      ['terms', '2026-08-11'],
      ['cookies', '2026-09-12'],
    ] as const) {
      expect(policyHistoryForKey(key)?.versions.at(-1), key).toMatchObject({
        date: served,
        status: 'archived',
        published: true,
      });
    }
  });

  it('says whether a replaced version applied on this site or was replaced before it was published, and names the first version published after one that never was', () => {
    const privacy = policyHistoryForKey('privacy');
    const terms = policyHistoryForKey('terms');
    const subprocessors = policyHistoryForKey('subprocessors');
    expect(privacy && terms && subprocessors).toBeTruthy();
    if (!privacy || !terms || !subprocessors) return;

    expect(versionStanding(privacy, '2026-09-12')).toBe(
      'This version applied until the version dated 2026-09-29 replaced it on this site.',
    );
    expect(versionStanding(privacy, '2026-09-21')).toBe(
      'This version was settled on 2026-09-21 and replaced on 2026-09-22 before it was published on this site; the first version published here after it is dated 2026-09-29.',
    );
    expect(versionStanding(privacy, '2026-09-27')).toBe(
      'This version was settled on 2026-09-27 and replaced on 2026-09-29 before it was published on this site; the first version published here after it is dated 2026-09-29.',
    );
    expect(versionStanding(subprocessors, '2026-09-21')).toBe(
      'This version was settled on 2026-09-21 and replaced on 2026-09-22 before it was published on this site; the first version published here after it is dated 2026-09-28.',
    );
    expect(versionStanding(terms, '2026-08-11')).toBe(
      'This version applied until the version dated 2026-09-23 replaced it on this site.',
    );
    expect(versionStanding(terms, '2026-09-22')).toBe(
      'This version was settled on 2026-09-22 and replaced on 2026-09-23 before it was published on this site; the first version published here after it is dated 2026-09-23.',
    );
    expect(versionStanding(privacy, privacy.current)).toBeNull();
  });

  it('says the first version published after versions this site never published is the first to publish their changes', () => {
    const privacy = policyHistoryForKey('privacy');
    const terms = policyHistoryForKey('terms');
    const subprocessors = policyHistoryForKey('subprocessors');
    const cookies = policyHistoryForKey('cookies');
    expect(privacy && terms && subprocessors && cookies).toBeTruthy();
    if (!privacy || !terms || !subprocessors || !cookies) return;

    expect(firstPublishedStanding(subprocessors, '2026-09-28')).toBe(
      'This version is the first published on this site since the one dated 2026-09-12, so it is the first to publish the changes made in the versions dated 2026-09-21 and 2026-09-22. The window to object to a subprocessor added in those versions runs from the day this version is first published here.',
    );
    expect(firstPublishedStanding(privacy, '2026-09-29')).toBe(
      'This version is the first published on this site since the one dated 2026-09-12, so it is the first to publish the changes made in the versions dated 2026-09-21, 2026-09-22 and 2026-09-27.',
    );
    expect(firstPublishedStanding(terms, '2026-09-23')).toBe(
      'This version is the first published on this site since the one dated 2026-08-11, so it is the first to publish the changes made in the version dated 2026-09-22.',
    );
    expect(firstPublishedStanding(privacy, '2026-09-27')).toBeNull();
    expect(firstPublishedStanding(privacy, '2026-09-12')).toBeNull();
    expect(firstPublishedStanding(cookies, cookies.current)).toBeNull();
  });

  it('says a version is the first of its policy published here when no version before it was', () => {
    const revisedBeforePublication: PolicyHistory = {
      key: 'subprocessors',
      label: 'Subprocessors',
      route: '/subprocessors',
      slug: 'subprocessors',
      current: '2026-10-05',
      versions: [
        { date: '2026-10-05', summary: 'Second.', status: 'current', published: null },
        { date: '2026-09-30', summary: 'First.', status: 'archived', published: false },
      ],
    };

    expect(firstPublishedStanding(revisedBeforePublication, '2026-10-05')).toBe(
      'This version is the first of this policy published on this site, so it is the first to publish the changes made in the version dated 2026-09-30. The window to object to a subprocessor added in that version runs from the day this version is first published here.',
    );
    expect(versionStanding(revisedBeforePublication, '2026-09-30')).toBe(
      'This version was settled on 2026-09-30 and replaced on 2026-10-05 before it was published on this site; the first version published here after it is dated 2026-10-05.',
    );
  });

  it('dates the publication floor by the first check of what production served', () => {
    expect(POLICY_PUBLICATION_FLOOR.date).toBe(REGISTRY.publications[0]?.checkedOn);
    expect(POLICY_PUBLICATION_FLOOR).toEqual({ date: '2026-10-02', label: '2 October 2026' });
  });

  it('links every dated policy page to its version history', () => {
    for (const key of Object.keys(POLICY_LAST_UPDATED)) {
      const route = CANONICAL_POLICY_ROUTES[key as keyof typeof CANONICAL_POLICY_ROUTES];
      const source = readFileSync(path.join(WEB_DIR, 'app', route, 'page.tsx'), 'utf8');
      expect(source, route).toContain(`<PolicyVersionsLink policy="${key}"`);
    }
  });
});

describe('policy changes', () => {
  it('lists every revision that moved a policy date, and every policy first published after histories began, with the summary the registry records', () => {
    const summaries = new Map(
      policyChanges().map((change) => [`${change.history.key} ${change.date}`, change.summary]),
    );
    for (const key of Object.keys(REGISTRY.documents)) {
      for (const revision of listedRevisions(key)) {
        const listed = `${key} ${revision.date}`;
        expect(revision.summary?.trim(), listed).toBeTruthy();
        expect(summaries.has(listed), listed).toBe(true);
        expect(summaries.get(listed), listed).toBe(revision.summary);
      }
    }
  });

  it('lists the subprocessor list, privacy policy, mobile app terms and trust posture from their 21 September 2026 revisions', () => {
    for (const key of ['subprocessors', 'privacy', 'mobile', 'trust']) {
      const [served, ...revisions] = datedRevisions(key).map((revision) => revision.date);
      expect(policyHistoryForKey(key)?.versions.at(-1)?.date, key).toBe(served);
      expect(revisions[0], key).toBe('2026-09-21');
      expect(listedDates(key), key).toEqual(revisions.reverse());
    }
  });

  it('lists exactly the versions whose history says what changed, newest first', () => {
    const expected = Object.entries(manifest.policies).flatMap(([key, policy]) =>
      policy.versions.flatMap((version) => (version.summary ? [`${version.date} ${key}`] : [])),
    );
    const listed = policyChanges().map((change) => `${change.date} ${change.history.key}`);
    const dates = listed.map((entry) => entry.slice(0, 10));

    expect([...listed].sort()).toEqual(expected.sort());
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('marks as introduced exactly the policies first published after version histories began', () => {
    const introduced = Object.keys(REGISTRY.documents).filter((key) =>
      introducedAfterHistoriesBegan(datedRevisions(key)[0]),
    );

    expect(introduced).toContain('referralTerms');
    expect(
      policyChanges()
        .filter((change) => change.introduced)
        .map((change) => `${change.history.key} ${change.date}`)
        .sort(),
    ).toEqual(introduced.map((key) => `${key} ${datedRevisions(key)[0]?.date}`).sort());
  });

  it('never reports what a listed version did to accounts or visitors before it was published here', () => {
    const unpublished = policyChanges().filter(
      (change) => change.date < POLICY_PUBLICATION_FLOOR.date,
    );

    expect(unpublished.length).toBeGreaterThan(0);
    for (const change of unpublished) {
      expect(change.summary, `${change.history.key} ${change.date}`).not.toMatch(
        /\bwere (asked|told|notified|prompted|shown)\b/i,
      );
    }
  });
});
