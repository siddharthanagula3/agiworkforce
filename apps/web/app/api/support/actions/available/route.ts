/**
 * GET /api/support/actions/available
 *
 * What the assistant can honestly offer this caller right now, what it cannot
 * offer and why, and what it will never do together with the real control for
 * each of those.
 *
 * The `excluded` list is returned deliberately: it is what lets the widget say
 * "I can't cancel your subscription, here's where you do it" instead of
 * silently doing nothing. An excluded id can never appear in `actions`, and a
 * test asserts the two sets are disjoint.
 */

import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { listAvailableSupportActions } from '@/lib/support/actions/service';

async function handleGet(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'support-account-context');
  if (rateLimited) return rateLimited;

  // Authentication is required even for this read: an action list is only
  // meaningful for a caller who could actually run one, and the signed-out
  // widget must not render controls that would 401 on use.
  await getClerkAuthUser(request);

  return NextResponse.json(listAvailableSupportActions());
}

export const GET = withErrorHandler(handleGet);
