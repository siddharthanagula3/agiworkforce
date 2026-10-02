import 'server-only';

import type { FreeQuotaTermsReviewStanding } from '@agiworkforce/cloud-contracts';
import { isFreeEligibilityValid, type FreeEligibility } from '@agiworkforce/routing';
import { z } from 'zod';
import { getProviderOffering } from '@agiworkforce/types';

import freePoolsDocument from '@/config/free-pools.json';

const QUOTA_WINDOWS = ['minute', 'hour', 'day', 'month', 'allocation'] as const;
const ALLOCATION_WINDOW = 'allocation' satisfies (typeof QUOTA_WINDOWS)[number];
const QUOTA_UNITS = ['requests', 'tokens', 'credits', 'neurons'] as const;
const MIN_IDENTIFIER_LENGTH = 1;
const MIN_QUOTA_LIMIT = 1;
const MIN_SCHEMA_VERSION = 1;
const PREVIEW_MODEL_MARKER = /preview/i;

const FreePoolTermsSchema = z.object({
  commercialUseAllowed: z.boolean(),
  thirdPartyServingAllowed: z.boolean(),
  proxyingAllowed: z.boolean(),
  promptsExcludedFromTraining: z.boolean(),
});

const FreePoolEntrySchema = z
  .object({
    routeId: z.string().min(MIN_IDENTIFIER_LENGTH),
    poolId: z.string().min(MIN_IDENTIFIER_LENGTH),
    terms: FreePoolTermsSchema,
    evidenceUrl: z.string().url(),
    reviewedBy: z.string().min(MIN_IDENTIFIER_LENGTH).nullable(),
    verifiedAtMs: z.number().int().positive().nullable(),
    expiresAtMs: z.number().int().positive().nullable(),
    window: z.enum(QUOTA_WINDOWS),
    limit: z.number().int().min(MIN_QUOTA_LIMIT),
    unit: z.enum(QUOTA_UNITS),
    hardStopsBeforePaid: z.boolean(),
  })
  .refine((entry) => entry.window !== ALLOCATION_WINDOW || entry.expiresAtMs !== null, {
    message: 'an allocation never resets, so it must carry the expiry that ends it',
    path: ['expiresAtMs'],
  });

function isPreviewOffering(offeringKey: string): boolean {
  return PREVIEW_MODEL_MARKER.test(getProviderOffering(offeringKey)?.providerModelId ?? '');
}

const FreeQuotaObservationSchema = z.object({
  offeringKey: z
    .string()
    .refine((key) => getProviderOffering(key) !== null, 'Unknown provider offering'),
  sourcePage: z.number().int().positive(),
  sourceRow: z.number().int().positive(),
  limit: z.number().int().positive().nullable(),
  unit: z.enum(['tokens', 'images', 'seconds', 'chars', 'calls']).nullable(),
  consumedApproximate: z.number().nonnegative().nullable(),
  expiresOn: z.string().date().nullable(),
  providerStatus: z.enum(['active', 'expired', 'unknown']),
  quotaOnlyObserved: z.boolean(),
});

export const FreeQuotaInventorySchema = z
  .object({
    observedOn: z.string().date(),
    issuer: z.string().min(1),
    source: z.string().min(1),
    evidenceUrl: z.string().url(),
    reportedEligible: z.number().int().nonnegative(),
    reportedUnavailable: z.number().int().nonnegative(),
    sources: z.array(z.string().min(1)).min(1),
    entries: z.array(FreeQuotaObservationSchema),
    termsReview: z
      .object({
        terms: FreePoolTermsSchema,
        evidenceUrl: z.string().url(),
        reviewedBy: z.string().min(1),
        verifiedAtMs: z.number().int().positive(),
        expiresAtMs: z.number().int().positive(),
        approvedOfferingKeys: z.array(z.string().min(1)).min(1),
      })
      .nullable(),
  })
  .superRefine((inventory, context) => {
    const seen = new Set<string>();
    inventory.entries.forEach((entry, index) => {
      if (seen.has(entry.offeringKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entries', index],
          message: 'Duplicate quota observation',
        });
      }
      seen.add(entry.offeringKey);
      if (entry.sourcePage > inventory.sources.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entries', index],
          message: 'Unknown screenshot page',
        });
      }
    });
    if (inventory.entries.length !== inventory.reportedEligible + inventory.reportedUnavailable) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Quota inventory does not account for the source total',
      });
    }
    if (inventory.termsReview) {
      const approved = new Set<string>();
      for (const key of inventory.termsReview.approvedOfferingKeys) {
        if (!seen.has(key) || approved.has(key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['termsReview', 'approvedOfferingKeys'],
            message: 'Terms review must name distinct observed offerings',
          });
        }
        if (isPreviewOffering(key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['termsReview', 'approvedOfferingKeys'],
            message: `Terms review must leave out preview models, which the Preview Product Terms keep to internal testing: ${key}`,
          });
        }
        approved.add(key);
      }
    }
  });

export type FreeQuotaInventory = z.infer<typeof FreeQuotaInventorySchema>;
export type FreeQuotaObservation = z.infer<typeof FreeQuotaObservationSchema>;
export type FreeQuotaTermsReview = NonNullable<FreeQuotaInventory['termsReview']>;

export function termsReviewStanding(
  review: FreeQuotaTermsReview | null,
  nowMs: number,
  reminderLeadMs = 0,
): FreeQuotaTermsReviewStanding {
  if (!review) return 'missing';
  if (review.verifiedAtMs > nowMs) return 'not_yet_valid';
  if (review.expiresAtMs <= nowMs) return 'expired';
  if (!Object.values(review.terms).every(Boolean)) return 'terms_refused';
  return review.expiresAtMs - nowMs <= reminderLeadMs ? 'expiring' : 'current';
}

export function reviewedQuotaOfferingKeys(
  inventory: FreeQuotaInventory,
  nowMs: number,
): ReadonlySet<string> {
  const review = inventory.termsReview;
  if (!review || termsReviewStanding(review, nowMs) !== 'current') return new Set();
  return new Set(review.approvedOfferingKeys);
}

export const FreePoolsDocumentSchema = z.object({
  schemaVersion: z.number().int().min(MIN_SCHEMA_VERSION),
  workbook: z.string().min(MIN_IDENTIFIER_LENGTH),
  notes: z.string().optional(),
  entries: z.array(FreePoolEntrySchema),
  inventory: FreeQuotaInventorySchema.optional(),
});

export type FreePoolTerms = z.infer<typeof FreePoolTermsSchema>;
export type FreePoolEntry = z.infer<typeof FreePoolEntrySchema>;
export type FreePoolsDocument = z.infer<typeof FreePoolsDocumentSchema>;

export type FreePoolIneligibilityReason =
  'not_verified_free' | 'verification_expired' | 'terms_incompatible' | 'no_hard_stop_before_paid';

export type FreePoolDecision =
  | { eligible: true; entry: FreePoolEntry; eligibility: FreeEligibility }
  | { eligible: false; entry: FreePoolEntry; reason: FreePoolIneligibilityReason };

export function isEntryVerified(entry: FreePoolEntry): boolean {
  return entry.verifiedAtMs !== null && entry.reviewedBy !== null;
}

export function toFreeEligibility(entry: FreePoolEntry): FreeEligibility | undefined {
  if (entry.verifiedAtMs === null || entry.reviewedBy === null) return undefined;
  return {
    routeId: entry.routeId,
    quotaPoolId: entry.poolId,
    terms: entry.terms,
    verifiedAtMs: entry.verifiedAtMs,
    verificationSource: entry.evidenceUrl,
    ...(entry.expiresAtMs === null ? {} : { expiresAtMs: entry.expiresAtMs }),
  };
}

export function evaluateFreePoolEntry(entry: FreePoolEntry, nowMs: number): FreePoolDecision {
  const eligibility = toFreeEligibility(entry);
  if (!eligibility) return { eligible: false, entry, reason: 'not_verified_free' };
  if (eligibility.expiresAtMs !== undefined && eligibility.expiresAtMs <= nowMs) {
    return { eligible: false, entry, reason: 'verification_expired' };
  }
  if (!isFreeEligibilityValid(eligibility, nowMs)) {
    return { eligible: false, entry, reason: 'terms_incompatible' };
  }
  if (!entry.hardStopsBeforePaid) {
    return { eligible: false, entry, reason: 'no_hard_stop_before_paid' };
  }
  return { eligible: true, entry, eligibility };
}

export function parseFreePoolsDocument(value: unknown): FreePoolsDocument {
  return FreePoolsDocumentSchema.parse(value);
}

export function loadFreePools(): FreePoolsDocument {
  return parseFreePoolsDocument(freePoolsDocument);
}

export function freePoolDecisions(
  nowMs: number,
  document: FreePoolsDocument = loadFreePools(),
): readonly FreePoolDecision[] {
  return document.entries.map((entry) => evaluateFreePoolEntry(entry, nowMs));
}

export function eligibleFreeEligibility(
  nowMs: number,
  document: FreePoolsDocument = loadFreePools(),
): Readonly<Record<string, FreeEligibility>> {
  const records: Record<string, FreeEligibility> = {};
  for (const decision of freePoolDecisions(nowMs, document)) {
    if (decision.eligible) records[decision.entry.routeId] = decision.eligibility;
  }
  return records;
}
