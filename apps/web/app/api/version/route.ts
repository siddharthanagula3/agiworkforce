import 'server-only';

import { NextResponse } from 'next/server';

import { deployEnvironment, deployRegion, deploymentId, releaseSha } from '@/lib/server/hosting';

export const dynamic = 'force-dynamic';

const UNKNOWN_VALUE = 'unknown';

export function GET() {
  return NextResponse.json(
    {
      commit: releaseSha() ?? UNKNOWN_VALUE,
      environment: deployEnvironment() ?? UNKNOWN_VALUE,
      deploymentId: deploymentId() ?? null,
      region: deployRegion() ?? null,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
