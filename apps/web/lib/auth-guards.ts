import 'server-only';

import type { NextRequest } from 'next/server';

import {
  PLATFORM_ADMIN_ENV_VAR,
  isPlatformAdmin,
  parsePlatformAdminIds,
} from '@/features/admin/lib/platform-admin-access';

import { assertAccountActive, getClerkAuthUser, type AuthResult } from './api-auth';
import { createError } from './errors';
import { logger } from './logger';

/**
 * Require a platform operator: a user id on the `AGI_PLATFORM_ADMIN_USER_IDS`
 * allowlist. An org `admin`/`owner` role never qualifies: it is self-service,
 * and these surfaces reach across tenants.
 *
 * A caller who is not on the allowlist gets 404, not 403: the existence of the
 * operator surface is itself not something a customer admin should be able to
 * confirm.
 *
 * @throws {AppError} 401 if not authenticated, 404 if not a platform operator
 */
export async function requirePlatformAdmin(request: NextRequest): Promise<AuthResult> {
  const authResult = await getClerkAuthUser(request);
  const allowlist = process.env[PLATFORM_ADMIN_ENV_VAR];

  if (parsePlatformAdminIds(allowlist).length === 0) {
    logger.error(
      { envVar: PLATFORM_ADMIN_ENV_VAR },
      'Platform operator allowlist is unset, so every platform-admin surface answers 404 to everyone',
    );
  }

  // A desktop device token is a different trust boundary from the browser
  // session these surfaces are built for: a leaked one must not reach
  // platform-wide ban, cross-tenant erasure, or takedown.
  if (authResult.surfaceClass === 'developer') {
    throw createError.notFound('Not found.');
  }

  if (!isPlatformAdmin(authResult.userId, allowlist)) {
    throw createError.notFound('Not found.');
  }

  await assertAccountActive(authResult.userId);
  return authResult;
}
