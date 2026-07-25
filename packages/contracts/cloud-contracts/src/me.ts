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
import { EffectiveCapabilityDocumentSchema } from './capability-handshake';

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
    /**
     * Deployment capability (not a user entitlement): the reachable E2B
     * code-execution loop is enabled on this deployment (AGI_E2B_EXECUTION=1).
     * Clients gate code-execution affordances on this so the toggle is never
     * cosmetic. Optional for rollout compatibility.
     */
    code_execution: z.boolean().optional(),
    /**
     * Deployment capability (not entitlement): AGI's generic function-tool
     * web-search backend is configured. Native provider search does not depend
     * on this flag. Optional for rollout compatibility.
     */
    generic_web_search: z.boolean().optional(),
  })
  // Forward-compat: the server may add flags before clients know about them.
  .catchall(z.unknown());

export const MeRoutingPreferencesSchema = z
  .object({
    us_only: z.boolean().optional(),
    geo_overlay: z.string().optional(),
  })
  .catchall(z.unknown());

/**
 * Canonical profile identity (PER-8).
 *
 * The full name used to live in three places at once — `profiles.display_name`
 * (written by `PATCH /api/me`), Clerk `unsafeMetadata.full_name` (written by
 * Settings → General) and the `general` settings namespace — and the reader in
 * `/api/me` consulted only the first two, so "Full name" in Settings could not
 * change the greeting, header or sidebar. The server now resolves ONE answer
 * and ships it here; clients read this and never re-derive it.
 */
export const MeProfileSchema = z.object({
  /** Full name, or null when the user has never set one. */
  display_name: z.string().nullable(),
  /** What the assistant should call the user; null falls back to the first token of display_name. */
  preferred_name: z.string().nullable(),
  /** Self-described role (Settings → General), or null. */
  work_description: z.string().nullable(),
});

export const MeResponseSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string(),
  /**
   * Resolved profile identity. Optional for rollout compatibility (older
   * fixtures/clients predate it), mirroring `feature_flags.code_execution`.
   */
  profile: MeProfileSchema.optional(),
  avatar_url: z.string().nullable(),
  /** Currently always null from the route; typed loosely for when it's wired. */
  created_at: z.union([z.string(), z.number()]).nullable(),
  /** Unix seconds. */
  updated_at: z.number(),
  plan: MePlanSchema,
  feature_flags: MeFeatureFlagsSchema,
  routing_preferences: MeRoutingPreferencesSchema,
  /**
   * Server-authoritative effective-capability handshake (six-app finding A):
   * the intersection of model/tier/surface/settings policy layers for this
   * account. Optional for rollout compatibility (older fixtures/clients
   * predate this field; forward-compat mirrors `feature_flags.code_execution`
   * above). See `@agiworkforce/types` `capability-handshake/` for the
   * in-process contract this wire shape mirrors.
   */
  capability_handshake: EffectiveCapabilityDocumentSchema.optional(),
});

export type MePlan = z.infer<typeof MePlanSchema>;
export type MeProfile = z.infer<typeof MeProfileSchema>;
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
