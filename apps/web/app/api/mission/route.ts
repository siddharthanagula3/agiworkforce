import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getSecurityHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { retiredManagedExecutionResponse } from '@/lib/server/retired-managed-execution';

export const runtime = 'nodejs';

export function POST(): NextResponse {
  return retiredManagedExecutionResponse(getSecurityHeaders());
}

export function OPTIONS(request: NextRequest): NextResponse {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
