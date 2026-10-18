import 'server-only';

import type { NextRequest } from 'next/server';
import { isOriginAllowed } from '@/lib/cors';
import { SITE_URL } from '@/lib/seo/site';

export function resolveCheckoutReturnOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin');
  if (origin && isOriginAllowed(origin, true)) return origin.replace(/\/$/, '');
  return SITE_URL;
}
