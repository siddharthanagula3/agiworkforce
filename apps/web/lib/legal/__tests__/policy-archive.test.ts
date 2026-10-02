import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import manifest from '@/content/legal/policy-archive/manifest.json';
import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  POLICY_PUBLICATION_FLOOR,
  archivedPolicyText,
  olderArchivedVersion,
  policyChanges,
  policyHistories,
  policyHistoryForKey,
} from '../policy-archive';

const WEB_DIR = path.join(__dirname, '..', '..', '..');

interface RegistryVersion {
  date: string | null;
  summary?: string;
}

const REGISTRY: { documents: Record<string, { versions: RegistryVersion[] }> } = JSON.parse(
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
    expect(olderArchivedVersion(privacy, '2026-09-21')).toBeNull();
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
  it('lists every revision that moved a policy date, with the summary the registry records', () => {
    const summaries = new Map(
      policyChanges().map((change) => [`${change.history.key} ${change.date}`, change.summary]),
    );
    for (const key of Object.keys(REGISTRY.documents)) {
      for (const revision of datedRevisions(key).slice(1)) {
        const listed = `${key} ${revision.date}`;
        expect(revision.summary?.trim(), listed).toBeTruthy();
        expect(summaries.has(listed), listed).toBe(true);
        expect(summaries.get(listed), listed).toBe(revision.summary);
      }
    }
  });

  it('lists the subprocessor list, privacy policy and mobile app terms from their 21 September 2026 revisions', () => {
    for (const key of ['subprocessors', 'privacy', 'mobile']) {
      const dates = datedRevisions(key).map((revision) => revision.date);
      expect(dates[0], key).toBe('2026-09-21');
      expect(listedDates(key), key).toEqual(dates.reverse());
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
