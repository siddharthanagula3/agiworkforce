import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { DataExportArchiveResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { readDataExportArchive } from '@/lib/server/data-export-archive';

async function handleReadArchive(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation-read', userId);
  if (rateLimitResponse) return rateLimitResponse;

  const body: DataExportArchiveResponse = { archive: await readDataExportArchive(db, userId) };
  return NextResponse.json(body);
}

export const GET = withPrivateNoStore(withCorsRoute(withErrorHandler(handleReadArchive)));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
