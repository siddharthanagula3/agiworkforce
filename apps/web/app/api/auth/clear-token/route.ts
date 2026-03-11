import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';

export async function POST(request: Request) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const cookieStore = await cookies();
  cookieStore.delete('agi_access_token');
  cookieStore.delete('agi_refresh_token');
  return NextResponse.json({ ok: true });
}
