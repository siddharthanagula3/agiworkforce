import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { getUserScopedDb } from '@/lib/server/rls-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import {
  buildSupportAccountCitations,
  resolveSupportAccountContext,
} from '@/lib/support/account/context-resolver';
import { toModelSafeAccountFacts } from '@/lib/support/account/model-safe-facts';
import { type SupportAccountContextResponse } from '@agiworkforce/cloud-contracts/support';

async function handleGet(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'support-account-context');
  if (rateLimited) return rateLimited;

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const context = await resolveSupportAccountContext(db, userId);

  const body: SupportAccountContextResponse = {
    context,
    facts: toModelSafeAccountFacts(context),
    citations: buildSupportAccountCitations(context),
  };
  return NextResponse.json(body);
}

export const GET = withErrorHandler(handleGet);
