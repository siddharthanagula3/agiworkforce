import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getIdentityProvider } from '@/lib/server/identity';
import { getNeonDb } from '@/lib/server/neon-db';
import { handleIdentitySecurityEvent } from '@/lib/services/identity-events';
import { invalidateIdentityAccountCache } from '@/lib/server/identity-account';
import { listAccountIdentities, unlinkAccountIdentity } from '@/lib/server/identity-links';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { stepUpActionSpec } from '@/lib/server/step-up/actions';

const ENDPOINT = '/api/settings/identities';
const SCOPE = { resolveOrganization: true } as const;

const UnlinkSchema = z.object({ identityId: z.string().uuid() }).strict();

const REFUSAL: Readonly<Record<'last_sign_in_method' | 'primary_sign_in_method', string>> = {
  last_sign_in_method:
    'This is the only way left to sign in. Add another sign-in method before removing this one.',
  primary_sign_in_method:
    'This is the sign-in method the account is registered under, so it cannot be removed. Removing it would be undone the next time you sign in.',
};

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getUserScopedDb(request, SCOPE);
  const identities = await listAccountIdentities(userId);

  return NextResponse.json({
    identities,
    consequence: stepUpActionSpec('identity.unlink').consequence,
  });
}

async function handleUnlink(request: NextRequest): Promise<NextResponse> {
  const { userId, organizationId } = await getUserScopedDb(request, SCOPE);

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, '2fa-setup', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = UnlinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Name the sign-in method to remove', parsed.error.issues);
  }
  const { identityId } = parsed.data;

  const grant = await requireStepUp({
    userId,
    action: 'identity.unlink',
    resourceId: identityId,
    organizationId,
    request,
    endpoint: ENDPOINT,
  });

  const result = await unlinkAccountIdentity(userId, identityId);

  if (result.outcome === 'unknown') {
    throw createError.notFound('That sign-in method is not on this account');
  }

  if (result.outcome !== 'unlinked') {
    await recordAuditEvent({
      userId,
      eventType: 'identity_unlinked',
      outcome: 'denied',
      severity: 'warning',
      request,
      endpoint: ENDPOINT,
      organizationId,
      detail: {
        resourceType: 'identity',
        resourceId: identityId,
        reason: result.outcome,
      },
    });
    throw createError.badRequest(REFUSAL[result.outcome]);
  }

  await invalidateIdentityAccountCache(result.identity.subject, result.identity.provider);

  // A sign-in method disappearing is the shape of an account takeover, so the
  // catalogue entry that audits it also tells the account holder and the risk engine.
  await handleIdentitySecurityEvent(getNeonDb(), getIdentityProvider(), {
    userId,
    event: 'identity_unlinked',
    request,
    organizationId,
    subjectRef: identityId,
    detail: {
      resourceId: identityId,
      provider: result.identity.provider,
      source: grant.method,
    },
  });

  return NextResponse.json({ removed: identityId });
}

export const GET = withErrorHandler(handleList);
export const DELETE = withErrorHandler(handleUnlink);
