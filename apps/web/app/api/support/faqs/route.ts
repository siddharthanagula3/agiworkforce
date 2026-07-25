import 'server-only';

import { NextResponse } from 'next/server';

/**
 * GET /api/support/faqs
 *
 * STB-20: RETIRED. Zero in-repo callers. These served static arrays from
 * lib/support/static-data.ts to a client that was never built; the /help and
 * /support pages render their content directly.
 *
 * Retired in place rather than deleted, matching the convention already used by
 * /api/agents/session and /api/usage/deduct: any client still pointed here gets
 * an explicit ENDPOINT_RETIRED signal instead of a 404 that reads like a broken
 * deploy.
 */
function handler(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'ENDPOINT_RETIRED',
        message: 'FAQs are rendered directly by the /support page.',
      },
    },
    { status: 410 },
  );
}

export const GET = handler;
