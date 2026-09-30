import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { normalizeDiagnostics } from '@/lib/support/diagnostics/schema';
import { deployEnvironment, releaseSha } from '@/lib/server/hosting';
import { logger } from '@/lib/logger';
import { requireHumanCaller } from '@/lib/security/bot-challenge';
import { BOT_CHALLENGED_ENDPOINTS } from '@/lib/security/bot-challenge-routes';
import { escalateToHuman, MissingContactEmailError } from '@/lib/support/handoff/handoff-service';
import { getCurrentUserRlsDb } from '@/lib/server/rls-db';
import { resolveHandoffIdentity } from '@/lib/support/handoff/request-identity';
import { SupportHandoffRequestSchema } from '@agiworkforce/cloud-contracts/support';

async function handleCreateHandoff(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-handoff-create');
  if (limited) return limited;

  await requireHumanCaller(BOT_CHALLENGED_ENDPOINTS.supportHandoffCreate);

  const body = await request.json().catch(() => null);
  const parsed = SupportHandoffRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.badRequest('Invalid support handoff payload', parsed.error.flatten());
  }

  const identity = await resolveHandoffIdentity(request, { needEmail: true });
  const ownerScope = identity.userId ? await getCurrentUserRlsDb() : null;

  try {
    // A client can send anything under `diagnostics`, so the bundle is parsed,
    // clamped and re-redacted here rather than trusted. A payload that fails
    // validation is dropped, never rejected: losing the machine context is not
    // a reason to refuse someone's support request.
    const diagnostics = normalizeDiagnostics(parsed.data.diagnostics, {
      releaseSha: releaseSha() ?? null,
      deployEnv: deployEnvironment() ?? null,
    });

    const { diagnostics: _unvalidated, ...payload } = parsed.data;

    const result = await escalateToHuman({
      ...payload,
      ...(diagnostics ? { diagnostics } : {}),
      ownerDb: ownerScope?.db ?? null,
      ownerUserId: identity.userId,
      ownerSessionKey: identity.ownerSessionKey,
      verifiedEmail: identity.verifiedEmail,
    });

    const response = NextResponse.json(result);
    if (identity.newCookie) response.headers.append('set-cookie', identity.newCookie);
    return response;
  } catch (error) {
    if (error instanceof MissingContactEmailError) {
      throw createError.badRequest('Add an email address so support can reply to you.', {
        field: 'contactEmail',
      });
    }
    logger.error({ error }, 'Support handoff creation failed');
    throw createError.internal('Could not raise a support request');
  }
}

export const POST = withErrorHandler(handleCreateHandoff);
