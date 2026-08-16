
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
    facts: toModelSafeAccountFacts(context),
    citations: buildSupportAccountCitations(context),
  });
}

export const GET = withErrorHandler(handleGet);
