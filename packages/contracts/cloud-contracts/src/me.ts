import { z } from 'zod';
import { EffectiveCapabilityDocumentSchema } from './capability-handshake';
export { CLIENT_VERSION_HEADER } from './header-names';

export const ME_CLIENT_VERSION_PARAM = 'client_version';

export const MeSubscriptionSourceSchema = z.enum(['none', 'stripe', 'apple', 'google', 'manual']);

export const MePlanSchema = z.object({
  tier: z.string(),
  display_name: z.string(),
  status: z.string(),
  current_period_end: z.number().nullable(),
  cancel_at_period_end: z.boolean().optional(),
  subscription_source: MeSubscriptionSourceSchema.optional(),
});

export const MeFeatureFlagsSchema = z
  .object({
    advanced_model_access: z.boolean(),
    code_execution: z.boolean().optional(),
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
 * A capability the server has switched off, with the sentence to show whoever
 * hits it. `reason` is null when the switch carries no explanation, which is
 * the difference between "this build is held off, here is why" and "off".
 */
export const MeDisabledFeatureSchema = z.object({
  capability: z.string(),
  reason: z.string().nullable(),
});

export const MeProfileSchema = z.object({
  display_name: z.string().nullable(),
  preferred_name: z.string().nullable(),
  work_description: z.string().nullable(),
});

export const MeResponseSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string(),
  profile: MeProfileSchema.optional(),
  avatar_url: z.string().nullable(),
  created_at: z.union([z.string(), z.number()]).nullable(),
  updated_at: z.number(),
  plan: MePlanSchema,
  feature_flags: MeFeatureFlagsSchema,
  feature_flag_variants: z.record(z.string(), z.string()).optional(),
  routing_preferences: MeRoutingPreferencesSchema,
  capability_handshake: EffectiveCapabilityDocumentSchema.optional(),
  disabled_features: z.array(MeDisabledFeatureSchema).optional(),
});

export type MePlan = z.infer<typeof MePlanSchema>;
export type MeSubscriptionSource = z.infer<typeof MeSubscriptionSourceSchema>;
export type MeProfile = z.infer<typeof MeProfileSchema>;
export type MeDisabledFeature = z.infer<typeof MeDisabledFeatureSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;

export function parseMeResponse(data: unknown): MeResponse {
  return MeResponseSchema.parse(data);
}
