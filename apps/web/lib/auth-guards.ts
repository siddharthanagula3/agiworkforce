import 'server-only';

import type { NextRequest } from 'next/server';

import {
  PLATFORM_ADMIN_ENV_VAR,
  isPlatformAdmin,
  parsePlatformAdminIds,
} from '@/features/admin/lib/platform-admin-access';

import { getIdentityUser } from './server/identity';
import { assertAccountActive, getClerkAuthUser, type AuthResult } from './api-auth';
import { createError } from './errors';
import { logger } from './logger';

async function getUserRole(userId: string): Promise<string | undefined> {
  try {
    const user = await getIdentityUser(userId);
    const role = user?.publicMetadata['role'];
    return typeof role === 'string' ? role : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Require an authenticated admin user. Throws on either no auth (401) or
 * authenticated-but-not-admin (403).
 *
 * Admin role is read from the identity provider's public metadata. Both "admin"
 * and "owner" are accepted as admin-equivalent.
 *
 * @throws {AppError} 401 if not authenticated, 403 if no admin role
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const authResult = await getClerkAuthUser(request);
  const role = await getUserRole(authResult.userId);
  if (role !== 'admin' && role !== 'owner') {
    throw createError.forbidden('Admin privileges required');
  }
  return authResult;
}

/**
 * Require a platform operator: a user id on the `AGI_PLATFORM_ADMIN_USER_IDS`
 * allowlist. Use this, never `requireAdmin`, for surfaces that reach across
 * tenants, since the org `admin`/`owner` role is self-service.
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

/**
 * Require an authenticated user with the named role. Owner is accepted in
 * place of admin (matches `requireAdmin`); all other roles must match exactly.
 *
 * @throws {AppError} 401 if not authenticated, 403 if role does not match
 */
export async function requireRole(request: NextRequest, role: string): Promise<AuthResult> {
  const authResult = await getClerkAuthUser(request);
  const userRole = await getUserRole(authResult.userId);
  const accepted =
    role === 'admin' ? userRole === 'admin' || userRole === 'owner' : userRole === role;
  if (!accepted) {
    throw createError.forbidden(`Requires role: ${role}`);
  }
  return authResult;
}
