import 'server-only';

import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { readServiceNotices } from '@/lib/server/service-notices';

async function handleNotices() {
  return NextResponse.json(
    { notices: await readServiceNotices() },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } },
  );
}

export const GET = withErrorHandler(handleNotices);
