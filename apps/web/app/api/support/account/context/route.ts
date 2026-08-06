/**
 * GET /api/support/account/context
 *
 * Read-only account context for the SIGNED-IN caller, plus the model-safe
 * projection of it and the citations an account-grounded answer needs.
 *
 * The caller identity comes from `getClerkAuthUser(request)` and nothing else.
 * There is no `userId` query parameter and no body — a support agent cannot ask
 * this endpoint about anyone but the person holding the session.
 *
 * Signed out (marketing widget) is a 401, and the widget renders the anonymous
 * experience: no account facts, no actions.
 */

import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import {
  buildSupportAccountCitations,
  resolveSupportAccountContext,
} from '@/lib/support/account/context-resolver';
import { toModelSafeAccountFacts } from '@/lib/support/account/model-safe-facts';

async function handleGet(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'support-account-context');
  if (rateLimited) return rateLimited;

  const { userId } = await getClerkAuthUser(request);
  const context = await resolveSupportAccountContext(userId);

  return NextResponse.json({
    context,
    // The ONLY field a caller may put in a model prompt.
    facts: toModelSafeAccountFacts(context),
    citations: buildSupportAccountCitations(context),
  });
}

export const GET = withErrorHandler(handleGet);
