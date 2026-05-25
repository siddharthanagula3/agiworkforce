import 'server-only';

import type { NextRequest } from 'next/server';

import { getClerkAuthUser, type AuthResult } from './api-auth';
import { createError } from './errors';

/**
 * Fetch the role from Clerk's publicMetadata for the given userId.
 * Returns undefined if the user has no role set.
 */
async function getUserRole(userId: string): Promise<string | undefined> {
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const meta = user.publicMetadata as Record<string, unknown> | null | undefined;
    const role = meta?.['role'];
    return typeof role === 'string' ? role : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Require an authenticated admin user. Throws on either no auth (401) or
 * authenticated-but-not-admin (403).
 *
 * Admin role is read from Clerk publicMetadata.role. Both "admin" and "owner"
 * are accepted as admin-equivalent.
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
