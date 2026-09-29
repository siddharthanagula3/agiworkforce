import 'server-only';

import { NextResponse } from 'next/server';
import type { ServiceNoticeList } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { readServiceNotices } from '@/lib/server/service-notices';

async function handleNotices() {
  const listed: ServiceNoticeList = { notices: await readServiceNotices() };
  return NextResponse.json(listed, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' },
  });
}

export const GET = withErrorHandler(handleNotices);
