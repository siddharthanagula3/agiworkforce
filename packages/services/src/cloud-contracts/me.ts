/**
 * Cloud contract — `GET /api/me`.
 *
 * Single source of truth for the response shape of the account endpoint
 * served by `apps/web/app/api/me/route.ts`. Every cloud-mode client
 * (web `authentication-manager`, desktop `cloudAccountAuth`, mobile tier
 * store) validates against this schema instead of hand-declaring its own
 * interface, so the server and all clients can no longer drift silently.
 *
 * Contract rules:
 *   - The server test (`apps/web/app/api/me/__tests__/route.contract.test.ts`)
 *     asserts the live route output parses against this schema — that test is
 *     the enforcement anchor. Change the route ⇒ change this schema ⇒ every
 *     client sees the change at typecheck time.
 *   - Clients narrow (read a subset of fields); they never widen. New server
 *     fields must be added here first.
 *   - Tier normalization stays client-side via `normalizeBillingPlanTier` /
 *     `asPlanTier` from `@agiworkforce/types` — `plan.tier` is a plain string
 *     on the wire.
 */

import { z } from 'zod';

export const MePlanSchema = z.object({
  /** Subscription tier — 'free' | 'basic' | 'pro' | 'max' | 'enterprise' (wire value; normalize client-side). */
  tier: z.string(),
  display_name: z.string(),
  status: z.string(),
  /** Unix seconds, or null when there is no active subscription period. */
  current_period_end: z.number().nullable(),
});

export const MeFeatureFlagsSchema = z
  .object({
    beta_features: z.boolean(),
    advanced_model_access: z.boolean(),
  })
  // Forward-compat: the server may add flags before clients know about them.
  .catchall(z.unknown());

export const MeRoutingPreferencesSchema = z
  .object({
    us_only: z.boolean().optional(),
    geo_overlay: z.string().optional(),
  })
  .catchall(z.unknown());

export const MeResponseSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string(),
  avatar_url: z.string().nullable(),
  /** Currently always null from the route; typed loosely for when it's wired. */
  created_at: z.union([z.string(), z.number()]).nullable(),
  /** Unix seconds. */
  updated_at: z.number(),
  plan: MePlanSchema,
  feature_flags: MeFeatureFlagsSchema,
  /**
   * `CreditService.getBalance` passthrough — shape is owned by the credit
   * service (and is null on lookup failure). Deliberately untyped here until
   * a client actually consumes it.
   */
  credits: z.unknown(),
  routing_preferences: MeRoutingPreferencesSchema,
});

export type MePlan = z.infer<typeof MePlanSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;

/**
 * Parse an untrusted `/api/me` payload. Throws ZodError on contract mismatch —
 * all three client call sites already degrade gracefully on throw (cached
 * tier / 'failed' fetch status / null user), so a mismatch surfaces as a
 * loud, diagnosable error instead of silent field-level drift.
 */
export function parseMeResponse(data: unknown): MeResponse {
  return MeResponseSchema.parse(data);
}
