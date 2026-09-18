import { z } from 'zod';

export const FEATURE_FLAG_ENV_VARS = {
  definitionCacheTtlMs: 'FEATURE_FLAG_DEFINITION_CACHE_TTL_MS',
  staleAfterDays: 'FEATURE_FLAG_STALE_AFTER_DAYS',
  staleCleanupBatch: 'FEATURE_FLAG_STALE_CLEANUP_BATCH',
} as const;

const DAY_MS = 86_400_000;

/**
 * Every tunable this subsystem has, in one schema with one parse. A value that
 * does not satisfy it does not silently become `NaN` at the call site: the
 * default stands and the deployment keeps the behaviour it shipped with.
 */
export const FeatureFlagConfigSchema = z
  .object({
    definitionCacheTtlMs: z.coerce.number().int().min(0).max(300_000).default(30_000),
    staleAfterDays: z.coerce.number().int().min(1).max(365).default(60),
    staleCleanupBatch: z.coerce.number().int().min(1).max(200).default(25),
  })
  .strict();

export type FeatureFlagConfig = z.infer<typeof FeatureFlagConfigSchema>;

export function readFeatureFlagConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): FeatureFlagConfig {
  const candidate = {
    definitionCacheTtlMs: env[FEATURE_FLAG_ENV_VARS.definitionCacheTtlMs],
    staleAfterDays: env[FEATURE_FLAG_ENV_VARS.staleAfterDays],
    staleCleanupBatch: env[FEATURE_FLAG_ENV_VARS.staleCleanupBatch],
  };
  const present = Object.fromEntries(
    Object.entries(candidate).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = FeatureFlagConfigSchema.safeParse(present);
  return parsed.success ? parsed.data : FeatureFlagConfigSchema.parse({});
}

export function staleAfterMs(config: FeatureFlagConfig): number {
  return config.staleAfterDays * DAY_MS;
}
