import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'auth-login');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const cookieStore = await cookies();
  cookieStore.delete('agi_access_token');
  cookieStore.delete('agi_refresh_token');
  return NextResponse.json({ ok: true });
}
