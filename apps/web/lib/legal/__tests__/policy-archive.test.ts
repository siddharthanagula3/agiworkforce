import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CANONICAL_POLICY_ROUTES, POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  archivedPolicyText,
  olderArchivedVersion,
  policyHistories,
  policyHistoryForKey,
} from '../policy-archive';

const WEB_DIR = path.join(__dirname, '..', '..', '..');

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
