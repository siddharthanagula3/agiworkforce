import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireHumanCaller } from '@/lib/security/bot-challenge';
import { BOT_CHALLENGED_ENDPOINTS } from '@/lib/security/bot-challenge-routes';
import { escalateToHuman, MissingContactEmailError } from '@/lib/support/handoff/handoff-service';
import { getCurrentUserRlsDb } from '@/lib/server/rls-db';
import { resolveHandoffIdentity } from '@/lib/support/handoff/request-identity';

const TurnSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(20_000),
  at: z.string().max(40),
});

const HandoffRequestSchema = z.object({
  surface: z.enum(['web-app', 'marketing']),
  reason: z.enum([
    'user_requested',
    'hard_abstain',
    'low_confidence',
    'no_citation',
    'action_refused',
  ]),
  summary: z.string().trim().min(1).max(1_000),
  transcript: z.array(TurnSchema).max(500),
  attemptedActions: z
    .array(
      z.object({
        action: z.string().max(200),
        outcome: z.enum(['succeeded', 'failed', 'refused', 'confirmation_pending']),
        detail: z.string().max(2_000).optional(),
        at: z.string().max(40),
      }),
    )
    .max(100)
    .optional(),
  citations: z
    .array(z.object({ title: z.string().max(300), url: z.string().max(2_000) }))
    .max(50)
    .optional(),
  contactEmail: z.string().trim().max(254).optional(),
  conversationId: z.string().max(200).optional(),
  pagePath: z.string().max(2_000).optional(),
  locale: z.string().max(35).optional(),
});

async function handleCreateHandoff(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-handoff-create');
  if (limited) return limited;

  await requireHumanCaller(BOT_CHALLENGED_ENDPOINTS.supportHandoffCreate);

  const body = await request.json().catch(() => null);
  const parsed = HandoffRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.badRequest('Invalid support handoff payload', parsed.error.flatten());
  }

  const identity = await resolveHandoffIdentity(request, { needEmail: true });
  const ownerScope = identity.userId ? await getCurrentUserRlsDb() : null;

  try {
    const result = await escalateToHuman({
      ...parsed.data,
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
