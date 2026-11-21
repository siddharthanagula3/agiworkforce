import { z } from 'zod';

export { ADULT_ELIGIBILITY_PATH } from './account-gate-paths';

export const ADULT_ELIGIBILITY_SURFACES = ['web-signup', 'web-login', 'mobile-auth'] as const;

export type AdultEligibilitySurface = (typeof ADULT_ELIGIBILITY_SURFACES)[number];

const PLAUSIBLE_AGE = z.number().int().min(0).max(120);

/**
 * What a surface offers as proof, in the shapes `decideAdultEligibility`
 * judges. An age or range is read once to reach a verdict and is not part of
 * what the server keeps.
 */
export const AdultEligibilityEvidenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('declared_age'), age: PLAUSIBLE_AGE.min(1) }).strict(),
  z.object({ kind: z.literal('age_checked_on_device'), minimumAge: PLAUSIBLE_AGE.min(1) }).strict(),
  z
    .object({
      kind: z.literal('platform_age_signal'),
      lowerBound: PLAUSIBLE_AGE.nullable(),
      upperBound: PLAUSIBLE_AGE.nullable(),
    })
    .strict(),
]);

export const AdultEligibilityRequestSchema = z
  .object({
    surface: z.enum(ADULT_ELIGIBILITY_SURFACES),
    evidence: AdultEligibilityEvidenceSchema,
  })
  .strict();

export type AdultEligibilityRequest = z.infer<typeof AdultEligibilityRequestSchema>;

/**
 * `confirmed`: a decision against the current minimum age is on record.
 * `unconfirmed`: nothing on record, or only a decision made under a lower
 * minimum, so the person has to be asked. `ineligible`: the account declared
 * an age under the minimum and stays closed to Cloud use.
 */
export const ADULT_ELIGIBILITY_STATES = ['confirmed', 'unconfirmed', 'ineligible'] as const;

export type AdultEligibilityState = (typeof ADULT_ELIGIBILITY_STATES)[number];

export const AdultEligibilityStatusSchema = z.object({
  minimumAge: z.number().int().positive(),
  state: z.enum(ADULT_ELIGIBILITY_STATES),
});

export type AdultEligibilityStatus = z.infer<typeof AdultEligibilityStatusSchema>;

export const ADULT_ELIGIBILITY_ERROR_CODES = {
  confirmationRequired: 'age_confirmation_required',
  ineligible: 'age_ineligible',
  inconclusive: 'age_evidence_inconclusive',
} as const;

export const ADULT_ELIGIBILITY_REVIEW_PATH = '/login/complete';
