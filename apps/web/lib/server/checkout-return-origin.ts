import 'server-only';

import type { NextRequest } from 'next/server';
import { isOriginAllowed } from '@/lib/cors';

export function resolveCheckoutReturnOrigin(request: NextRequest): string {
  const configured = (process.env['NEXT_PUBLIC_APP_URL'] ?? '').replace(/\/$/, '');
  const origin = request.headers.get('origin');
  if (origin && isOriginAllowed(origin, true)) return origin.replace(/\/$/, '');
  return configured;
}
