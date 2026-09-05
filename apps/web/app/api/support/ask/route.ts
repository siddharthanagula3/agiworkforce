import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { requireHumanCaller } from '@/lib/security/bot-challenge';
import { BOT_CHALLENGED_ENDPOINTS } from '@/lib/security/bot-challenge-routes';
import { toSupportAgentAccountFacts } from '@/lib/support/account/agent-facts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { resolveSupportAccountContext } from '@/lib/support/account/context-resolver';
import { getCurrentUserRlsDb } from '@/lib/server/rls-db';
import { toModelSafeAccountFacts } from '@/lib/support/account/model-safe-facts';
import { listAvailableSupportActions } from '@/lib/support/actions/service';
import {
  answerSupportQuestion,
  isSupportAgentEnabled,
  type SupportAccountFact,
  type SupportActionOption,
} from '@/lib/support/agent';
import { resolveHandoffIdentity } from '@/lib/support/handoff/request-identity';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  surface: z.enum(['marketing', 'app']),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) }))
    .max(50)
    .optional(),
});

interface AccountSignals {
  planTier: string | null;
  accountFacts: SupportAccountFact[];
  availableActions: SupportActionOption[];
}

const ANONYMOUS_SIGNALS: AccountSignals = {
  planTier: null,
  accountFacts: [],
  availableActions: [],
};

async function resolveAccountSignals(db: DatabaseAdapter, userId: string): Promise<AccountSignals> {
  try {
    const context = await resolveSupportAccountContext(db, userId);
    return {
      planTier: context.plan.effectiveTier,
      accountFacts: toSupportAgentAccountFacts(toModelSafeAccountFacts(context)),
      availableActions: listAvailableSupportActions().actions,
    };
  } catch (error) {
    logger.warn(
      { error, userId },
      '[support-agent] account context unavailable; answering without it',
    );
    return ANONYMOUS_SIGNALS;
  }
}

async function handleAsk(request: NextRequest) {
  if (!isSupportAgentEnabled()) {
    return NextResponse.json(
      { error: { code: 'SUPPORT_AGENT_DISABLED', message: 'Automated answers are turned off.' } },
      { status: 501, headers: { 'cache-control': 'no-store' } },
    );
  }

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const identity = await resolveHandoffIdentity(request);

  const rateLimited = await withRateLimit(
    request,
    identity.userId ? 'support-agent-user' : 'support-agent-anon',
    identity.userId ? `user:${identity.userId}` : undefined,
  );
  if (rateLimited) return rateLimited;

  await requireHumanCaller(BOT_CHALLENGED_ENDPOINTS.supportAsk);

  const parsed = RequestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid support question', parsed.error);
  }

  const askerScope = identity.userId ? await getCurrentUserRlsDb() : null;
  const signals = askerScope
    ? await resolveAccountSignals(askerScope.db, askerScope.userId)
    : ANONYMOUS_SIGNALS;

  const answer = await answerSupportQuestion({
    question: parsed.data.message,
    ...(parsed.data.history ? { history: parsed.data.history } : {}),
    surface: parsed.data.surface === 'app' ? 'app' : 'marketing',
    viewer: {
      isSignedIn: identity.userId !== null,
      userId: identity.userId,
      planTier: signals.planTier,
    },
    accountFacts: signals.accountFacts,
    availableActions: signals.availableActions,
    signal: request.signal,
  });

  const response = NextResponse.json(answer, { headers: { 'cache-control': 'no-store' } });
  if (identity.newCookie) response.headers.append('set-cookie', identity.newCookie);
  return response;
}

export const POST = withErrorHandler(handleAsk);
