import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MeRoutingPreferencesSchema } from '@agiworkforce/cloud-contracts';
import { logger } from '@/lib/logger';

/**
 * @file The routing preferences a user saved, read where routing happens.
 *
 * `us_only` is a real provider-exclusion overlay: the policy is in
 * `routing-policies.json`, both resolvers enforce it, and TS and Rust tests
 * cover it. `/api/me/routing-preferences` persists the user's choice. Nothing
 * ever read it back on the chat path, so a `max` or `enterprise` user who
 * excluded those providers was still routed to them.
 *
 * The gap was one missing read, not a missing feature, and the shape to copy
 * was already beside it: `zeroDataRetentionOnly` is resolved from stored policy
 * in the same parallel block and threaded through
 * `buildWebCloudAutoRoutingRequest` into the resolver. This does the same for
 * the preference the user set themselves.
 *
 * Fail-open on a read failure, deliberately, and unlike the org policy gate: an
 * unreachable profile row must not stop a turn, and the consequence of missing
 * the preference is a provider the user would rather avoid, not a policy
 * breach. A workspace-level prohibition belongs in the organization policy,
 * which is fail-closed and evaluated separately.
 */
export interface UserRoutingPreferences {
  /** Exclude the providers `routing-policies.json` lists under `usOnly`. */
  usOnly: boolean;
}

export const NO_USER_ROUTING_PREFERENCES: UserRoutingPreferences = { usOnly: false };

export async function resolveUserRoutingPreferences(
  db: DatabaseAdapter,
  userId: string,
): Promise<UserRoutingPreferences> {
  if (!userId) return NO_USER_ROUTING_PREFERENCES;

  try {
    const [row] = await db.query<{ routing_preferences: unknown }>(
      'select routing_preferences from profiles where id = $1 limit 1',
      [userId],
    );
    const parsed = MeRoutingPreferencesSchema.safeParse(row?.routing_preferences ?? {});
    if (!parsed.success) return NO_USER_ROUTING_PREFERENCES;
    return { usOnly: parsed.data.us_only === true };
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), userId },
      '[routing-preferences] read failed; routing proceeds without the user preference',
    );
    return NO_USER_ROUTING_PREFERENCES;
  }
}
