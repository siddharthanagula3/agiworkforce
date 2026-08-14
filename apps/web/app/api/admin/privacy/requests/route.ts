import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { requireAdmin } from '@/lib/auth-guards';
import { withRateLimit } from '@/lib/rate-limit';
import { readOpenDataRightsRequests } from '@/lib/server/data-rights-requests';

/**
 * GET /api/admin/privacy/requests — the open data-rights queue, oldest first.
 *
 * This route exists so the queue has a reader. A rights request that lands in a
 * table nobody can list is a dead control: the product would be able to say it
 * accepted the request and unable to say anyone ever saw it, which is the worse
 * of the two failures the DPDP Act cares about.
 *
 * It returns the requester's contact email and free text, which is exactly the
 * personal data the queue exists to act on, so it is admin-gated
 * (`requireAdmin`, Clerk publicMetadata.role of admin or owner) and never
 * cached.
 *
 * WHAT IT STILL DOES NOT DO: it does not page anyone, and nothing polls it.
 * Working this queue is a human routine — see DPDP_PROGRESS.md, where the gap
 * is recorded as an open operational item rather than described as solved.
 */

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  await requireAdmin(request);

  const requests = await readOpenDataRightsRequests();

  return NextResponse.json(
    { requests, count: requests.length },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withErrorHandler(handleGet);
