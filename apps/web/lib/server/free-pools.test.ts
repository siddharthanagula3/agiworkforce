import { describe, expect, it } from 'vitest';

import {
  eligibleFreeEligibility,
  evaluateFreePoolEntry,
  loadFreePools,
  parseFreePoolsDocument,
  toFreeEligibility,
  type FreePoolEntry,
} from './free-pools';

const NOW_MS = Date.UTC(2026, 8, 1);
const HOUR_MS = 60 * 60 * 1000;
const REVIEWER = 'founder';
const EVIDENCE_URL = 'https://console.groq.com/docs/legal/services-agreement';
const ROUTE_ID = 'groq/fixture-model';
const POOL_ID = 'groq-free-fixture-model';

function entry(overrides: Partial<FreePoolEntry> = {}): FreePoolEntry {
  return {
    routeId: ROUTE_ID,
    poolId: POOL_ID,
    terms: {
      commercialUseAllowed: true,
      thirdPartyServingAllowed: true,
      proxyingAllowed: true,
      promptsExcludedFromTraining: true,
    },
    evidenceUrl: EVIDENCE_URL,
    reviewedBy: REVIEWER,
    verifiedAtMs: NOW_MS - HOUR_MS,
    expiresAtMs: NOW_MS + HOUR_MS,
    window: 'day',
    limit: 1000,
    unit: 'requests',
    hardStopsBeforePaid: true,
    ...overrides,
  };
}

function document(entries: readonly FreePoolEntry[]) {
  return { schemaVersion: 1, workbook: 'docs/research/workbook.md', entries: [...entries] };
}

describe('free pools schema', () => {
  it('parses a fully verified entry', () => {
    const parsed = parseFreePoolsDocument(document([entry()]));
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.routeId).toBe(ROUTE_ID);
  });

  it('parses an unverified entry with null verification fields', () => {
    const parsed = parseFreePoolsDocument(
      document([entry({ reviewedBy: null, verifiedAtMs: null, expiresAtMs: null })]),
    );
    expect(parsed.entries[0]?.verifiedAtMs).toBeNull();
  });

  it('rejects an unknown quota unit', () => {
    expect(() =>
      parseFreePoolsDocument(document([entry({ unit: 'gallons' as FreePoolEntry['unit'] })])),
    ).toThrow();
  });

  it('rejects a missing terms fact', () => {
    const incomplete = entry();
    const { promptsExcludedFromTraining: _omitted, ...terms } = incomplete.terms;
    expect(() =>
      parseFreePoolsDocument(document([{ ...incomplete, terms } as FreePoolEntry])),
    ).toThrow();
  });

  it('rejects an evidence url that is not a url', () => {
    expect(() =>
      parseFreePoolsDocument(document([entry({ evidenceUrl: 'see the workbook' })])),
    ).toThrow();
  });
});

describe('free pool eligibility', () => {
  it('admits a verified, unexpired, hard-stopping entry', () => {
    const decision = evaluateFreePoolEntry(entry(), NOW_MS);
    expect(decision.eligible).toBe(true);
  });

  it('treats a null verifiedAtMs as ineligible', () => {
    const decision = evaluateFreePoolEntry(entry({ verifiedAtMs: null }), NOW_MS);
    expect(decision).toMatchObject({ eligible: false, reason: 'not_verified_free' });
  });

  it('treats a null reviewedBy as ineligible even when verifiedAtMs is set', () => {
    const decision = evaluateFreePoolEntry(entry({ reviewedBy: null }), NOW_MS);
    expect(decision).toMatchObject({ eligible: false, reason: 'not_verified_free' });
  });

  it('treats an expired verification as ineligible', () => {
    const decision = evaluateFreePoolEntry(entry({ expiresAtMs: NOW_MS - HOUR_MS }), NOW_MS);
    expect(decision).toMatchObject({ eligible: false, reason: 'verification_expired' });
  });

  it('treats expiry exactly at now as ineligible', () => {
    const decision = evaluateFreePoolEntry(entry({ expiresAtMs: NOW_MS }), NOW_MS);
    expect(decision).toMatchObject({ eligible: false, reason: 'verification_expired' });
  });

  it('rejects an entry whose terms fail', () => {
    const failing = entry();
    const decision = evaluateFreePoolEntry(
      { ...failing, terms: { ...failing.terms, promptsExcludedFromTraining: false } },
      NOW_MS,
    );
    expect(decision).toMatchObject({ eligible: false, reason: 'terms_incompatible' });
  });

  it('rejects an entry that bills overage instead of hard stopping', () => {
    const decision = evaluateFreePoolEntry(entry({ hardStopsBeforePaid: false }), NOW_MS);
    expect(decision).toMatchObject({ eligible: false, reason: 'no_hard_stop_before_paid' });
  });

  it('builds no eligibility record for an unverified entry', () => {
    expect(toFreeEligibility(entry({ verifiedAtMs: null }))).toBeUndefined();
  });

  it('carries the evidence url through as the verification source', () => {
    expect(toFreeEligibility(entry())?.verificationSource).toBe(EVIDENCE_URL);
  });
});

describe('the shipped configuration', () => {
  it('parses', () => {
    expect(() => loadFreePools()).not.toThrow();
  });

  it('yields no eligible routes, so shipping it changes no routing behaviour', () => {
    expect(eligibleFreeEligibility(NOW_MS)).toEqual({});
  });

  it('carries no entry that claims verification', () => {
    for (const candidate of loadFreePools().entries) {
      expect(candidate.verifiedAtMs).toBeNull();
      expect(candidate.reviewedBy).toBeNull();
    }
  });
});
