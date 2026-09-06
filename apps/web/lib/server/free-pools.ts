import 'server-only';

import { isFreeEligibilityValid, type FreeEligibility } from '@agiworkforce/routing';
import { z } from 'zod';

import freePoolsDocument from '@/config/free-pools.json';

const QUOTA_WINDOWS = ['minute', 'hour', 'day', 'month', 'allocation'] as const;
const ALLOCATION_WINDOW = 'allocation' satisfies (typeof QUOTA_WINDOWS)[number];
const QUOTA_UNITS = ['requests', 'tokens', 'credits', 'neurons'] as const;
const MIN_IDENTIFIER_LENGTH = 1;
const MIN_QUOTA_LIMIT = 1;
const MIN_SCHEMA_VERSION = 1;

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

export const FreePoolsDocumentSchema = z.object({
  schemaVersion: z.number().int().min(MIN_SCHEMA_VERSION),
  workbook: z.string().min(MIN_IDENTIFIER_LENGTH),
  notes: z.string().optional(),
  entries: z.array(FreePoolEntrySchema),
});

export type FreePoolTerms = z.infer<typeof FreePoolTermsSchema>;
export type FreePoolEntry = z.infer<typeof FreePoolEntrySchema>;
export type FreePoolsDocument = z.infer<typeof FreePoolsDocumentSchema>;

export type FreePoolIneligibilityReason =
  | 'not_verified_free'
  | 'verification_expired'
  | 'terms_incompatible'
  | 'no_hard_stop_before_paid';

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
