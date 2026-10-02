import { describe, expect, it } from 'vitest';

import {
  eligibleFreeEligibility,
  evaluateFreePoolEntry,
  loadFreePools,
  parseFreePoolsDocument,
  reviewedQuotaOfferingKeys,
  termsReviewStanding,
  toFreeEligibility,
  type FreePoolEntry,
  type FreeQuotaTermsReview,
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

  it('does not clear promotional offerings merely because they appear in a quota inventory', () => {
    const inventory = loadFreePools().inventory!;
    expect(inventory.termsReview).toBeNull();
    expect(reviewedQuotaOfferingKeys(inventory, NOW_MS).size).toBe(0);
  });

  it('clears only named offerings during a favorable, current review window', () => {
    const inventory = loadFreePools().inventory!;
    const key = inventory.entries[0]!.offeringKey;
    const review = {
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
      approvedOfferingKeys: [key],
    };
    const reviewed = { ...inventory, termsReview: review };
    expect(reviewedQuotaOfferingKeys(reviewed, NOW_MS)).toEqual(new Set([key]));
    expect(reviewedQuotaOfferingKeys(reviewed, NOW_MS + HOUR_MS).size).toBe(0);
    expect(
      reviewedQuotaOfferingKeys(
        {
          ...reviewed,
          termsReview: { ...review, terms: { ...review.terms, proxyingAllowed: false } },
        },
        NOW_MS,
      ).size,
    ).toBe(0);
    expect(() =>
      parseFreePoolsDocument({
        ...loadFreePools(),
        inventory: { ...reviewed, termsReview: { ...review, approvedOfferingKeys: [key, key] } },
      }),
    ).toThrow();
  });
});

describe('the terms review standing', () => {
  const DAY_MS = 24 * HOUR_MS;
  const LEAD_MS = 3 * DAY_MS;

  function review(overrides: Partial<FreeQuotaTermsReview> = {}): FreeQuotaTermsReview {
    return {
      terms: {
        commercialUseAllowed: true,
        thirdPartyServingAllowed: true,
        proxyingAllowed: true,
        promptsExcludedFromTraining: true,
      },
      evidenceUrl: EVIDENCE_URL,
      reviewedBy: REVIEWER,
      verifiedAtMs: NOW_MS - DAY_MS,
      expiresAtMs: NOW_MS + 30 * DAY_MS,
      approvedOfferingKeys: [loadFreePools().inventory!.entries[0]!.offeringKey],
      ...overrides,
    };
  }

  it('reads a review that is not recorded as missing', () => {
    expect(termsReviewStanding(null, NOW_MS, LEAD_MS)).toBe('missing');
  });

  it('reads a review dated after now as not yet valid', () => {
    expect(termsReviewStanding(review({ verifiedAtMs: NOW_MS + HOUR_MS }), NOW_MS, LEAD_MS)).toBe(
      'not_yet_valid',
    );
  });

  it('reads a review at or past its expiry as expired', () => {
    expect(termsReviewStanding(review({ expiresAtMs: NOW_MS }), NOW_MS, LEAD_MS)).toBe('expired');
  });

  it('reads a review with any term false as refusing the terms', () => {
    const refused = review({ terms: { ...review().terms, promptsExcludedFromTraining: false } });
    expect(termsReviewStanding(refused, NOW_MS, LEAD_MS)).toBe('terms_refused');
  });

  it('warns inside the reminder lead and not before it', () => {
    expect(termsReviewStanding(review({ expiresAtMs: NOW_MS + LEAD_MS }), NOW_MS, LEAD_MS)).toBe(
      'expiring',
    );
    expect(
      termsReviewStanding(review({ expiresAtMs: NOW_MS + LEAD_MS + 1 }), NOW_MS, LEAD_MS),
    ).toBe('current');
  });

  it('still clears its offerings while it is expiring', () => {
    const inventory = loadFreePools().inventory!;
    const expiring = review({ expiresAtMs: NOW_MS + HOUR_MS });
    expect(termsReviewStanding(expiring, NOW_MS, LEAD_MS)).toBe('expiring');
    expect(reviewedQuotaOfferingKeys({ ...inventory, termsReview: expiring }, NOW_MS)).toEqual(
      new Set(expiring.approvedOfferingKeys),
    );
  });
});
