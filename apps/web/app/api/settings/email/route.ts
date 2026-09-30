import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isIdentityRequestRejected, type IdentityUser } from '@agiworkforce/identity';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { readJsonBody } from '@/lib/read-json-body';
import { getIdentityProvider } from '@/lib/server/identity';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { announceTwoFactorChange } from '@/lib/server/two-factor-security-events';

const ENDPOINT = '/api/settings/email';

const AddressSchema = z.object({ emailAddress: z.string().trim().email().max(254) }).strict();
const AddressIdSchema = z.object({ emailAddressId: z.string().trim().min(1).max(255) }).strict();

async function currentUser(userId: string): Promise<IdentityUser> {
  const user = await getIdentityProvider().getUser(userId);
  if (!user) throw createError.unauthorized();
  return user;
}

function rejected(error: unknown): never {
  if (isIdentityRequestRejected(error)) {
    throw createError.validation(error.message).asUserSafe();
  }
  throw error;
}

async function handleAdd(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId, organizationId } = await getUserScopedDb(request);

  const rateLimitResponse = await withRateLimit(request, 'auth-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = AddressSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Enter a valid email address.', parsed.error.issues).asUserSafe();
  }
  const { emailAddress } = parsed.data;

  const user = await currentUser(userId);
  if (user.primaryEmail?.toLowerCase() === emailAddress.toLowerCase()) {
    throw createError.validation('That is already your email address.').asUserSafe();
  }

  await requireStepUp({
    userId,
    action: 'email.change',
    organizationId,
    request,
    endpoint: ENDPOINT,
  });

  const confirmed = user.emailAddresses.find(
    (address) =>
      address.verified && address.emailAddress.toLowerCase() === emailAddress.toLowerCase(),
  );
  if (confirmed) {
    return NextResponse.json({ emailAddressId: confirmed.id, verified: true });
  }

  const identity = getIdentityProvider();
  for (const stale of user.emailAddresses) {
    if (!stale.verified && stale.id !== user.primaryEmailAddressId) {
      await identity.removeEmailAddress(stale.id).catch(rejected);
    }
  }

  const added = await identity.addEmailAddress(userId, emailAddress).catch(rejected);
  logger.info({ userId }, 'Email change started');

  return NextResponse.json({ emailAddressId: added.id, verified: added.verified }, { status: 201 });
}

async function handleMakePrimary(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const rateLimitResponse = await withRateLimit(request, 'auth-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = AddressIdSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid email change', parsed.error.issues);
  }
  const { emailAddressId } = parsed.data;

  const user = await currentUser(userId);
  const next = user.emailAddresses.find((address) => address.id === emailAddressId);
  if (!next) {
    throw createError.notFound('That address is no longer on your account. Start again.');
  }
  if (!next.verified) {
    throw createError.validation('Enter the code sent to the new address first.').asUserSafe();
  }
  const previousId = user.primaryEmailAddressId;
  if (previousId === emailAddressId) {
    return NextResponse.json({ emailAddress: next.emailAddress, previousAddressRemoved: true });
  }

  const grant = await requireStepUp({
    userId,
    action: 'email.change',
    resourceId: emailAddressId,
    organizationId,
    request,
    endpoint: ENDPOINT,
  });

  await announceTwoFactorChange({
    userId,
    event: 'email_changed',
    noticeRef: emailAddressId,
    request,
    organizationId,
    detail: { source: grant.method, status: previousId === null ? 'added' : 'replaced' },
  });

  const identity = getIdentityProvider();
  await identity.setPrimaryEmailAddress(userId, emailAddressId).catch(rejected);
  await db.query('update public.profiles set email = $2, updated_at = now() where id = $1', [
    userId,
    next.emailAddress,
  ]);

  let previousAddressRemoved = previousId === null;
  if (previousId !== null) {
    try {
      await identity.removeEmailAddress(previousId);
      previousAddressRemoved = true;
    } catch (error) {
      if (!isIdentityRequestRejected(error)) throw error;
      logger.warn(
        { userId, code: error.code },
        'Previous email address kept after an email change',
      );
    }
  }

  return NextResponse.json({ emailAddress: next.emailAddress, previousAddressRemoved });
}

export const POST = withErrorHandler(handleAdd);
export const PATCH = withErrorHandler(handleMakePrimary);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
