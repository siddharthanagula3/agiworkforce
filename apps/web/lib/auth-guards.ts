import 'server-only';

import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

import { getAuthenticatedUser } from './api-auth';
import { createError } from './errors';

/**
 * Role-bearing user metadata. Supabase stores per-user authorization claims
 * in `app_metadata`, which is server-managed and not user-writable (unlike
 * `user_metadata`). We treat any of `admin` / `owner` as admin-equivalent
 * to mirror existing checks in `app/api/admin/security/route.ts`.
 */
type RoleMetadata = { role?: unknown } | null | undefined;

function getRole(user: User): string | undefined {
  const meta = user.app_metadata as RoleMetadata;
  const role = meta?.role;
  return typeof role === 'string' ? role : undefined;
}

/**
 * Require an authenticated admin user. Throws on either no auth (401) or
 * authenticated-but-not-admin (403).
 *
 * Internally calls `getAuthenticatedUser`, which supports both Bearer-token
 * and cookie-based SSR auth.
 *
 * WEB-13 (audit 2026-05-19): extracts the inline admin gate previously
 * duplicated in `app/api/admin/security/route.ts:52-86` so future admin
 * routes have a single, tested gate to import.
 *
 * @throws {AppError} 401 if not authenticated, 403 if no admin role
 */
export async function requireAdmin(request: NextRequest): Promise<User> {
  const user = await getAuthenticatedUser(request);
  const role = getRole(user);
  if (role !== 'admin' && role !== 'owner') {
    throw createError.forbidden('Admin privileges required');
  }
  return user;
}

/**
 * Require an authenticated user with the named role. Owner is accepted in
 * place of admin (matches `requireAdmin`); all other roles must match exactly.
 *
 * @throws {AppError} 401 if not authenticated, 403 if role does not match
 */
export async function requireRole(request: NextRequest, role: string): Promise<User> {
  const user = await getAuthenticatedUser(request);
  const userRole = getRole(user);
  const accepted = role === 'admin' ? userRole === 'admin' || userRole === 'owner' : userRole === role;
  if (!accepted) {
    throw createError.forbidden(`Requires role: ${role}`);
  }
  return user;
}
