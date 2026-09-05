import 'server-only';

import { resolveInternalUserId } from '@agiworkforce/identity';

import { getNeonDb } from '@/lib/server/neon-db';
import { getIdentityProvider } from '@/lib/server/identity';

/**
 * Turns an authenticated provider subject into this product's own user id.
 *
 * Every user_id column in the schema stores the subject itself today, so for
 * the configured provider this returns the subject with no round trip and the
 * request path is unchanged. A second provider's subjects are not user ids, and
 * this is the only place that difference is resolved, which is what keeps a
 * swap from becoming an UPDATE across most of the schema.
 *
 * Reads through the privileged connection on purpose: the mapping is what
 * establishes the user scope, so it cannot be read from inside one.
 */
export function resolveIdentityUserId(subject: string): Promise<string | null> {
  return resolveInternalUserId(getNeonDb(), getIdentityProvider().name, subject);
}
